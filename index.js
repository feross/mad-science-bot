import { Octokit } from '@octokit/rest'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import Discord from 'discord.js'

import {
  discord as discordSecret
} from '../secret/index.js'

const USERNAMES = [
  'feross'
]

const TMP_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'tmp')
const STATE_PATH = join(TMP_PATH, 'state.json')
const MAX_RUN_TIME = (5 * 60 * 1000) // 5 minutes

const octokit = new Octokit()

const discord = new Discord.Client()
discord.login(discordSecret.botToken)

fs.mkdirSync(TMP_PATH, { recursive: true })

discord.on('ready', run)

async function run () {
  setTimeout(() => {
    console.error('Process took too long to run, force killing...')
    process.exit(1)
  }, MAX_RUN_TIME).unref()

  let state
  try {
    state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
  } catch (err) {
    // First run of the program, or program crashed and state file got deleted.
    // In this case, we're conservative and don't post anything. Just load the
    // latest posts and store them in the state without posting. Then, the
    // *next* post will actually get posted.
    state = {}
  }

  for (const username of USERNAMES) {
    if (!state[username]) state[username] = []

    const res = await octokit.repos.listForUser({
      username,
      per_page: 100,
      sort: 'created',
      direction: 'desc'
    })

    if (res.status !== 200) {
      throw new Error(`Non-200 response: ${res.status} ${JSON.stringify(res.data)}`)
    }

    const repos = res.data.map(repo => ({
      name: repo.name,
      description: repo.description,
      fork: repo.fork,
      url: repo.html_url,
      owner: repo.owner.login,
      createdAt: new Date(repo.created_at)
    }))
      .filter(repo => !repo.fork)
      .filter(repo => repo.createdAt > Date.now() - (120 * 24 * 60 * 60 * 1000)) // not older than 1 week
      .filter(repo => !state[username].includes(repo.name))

    for (const repo of repos) {
      state[username].push(repo.name)
      await postRepoToDiscord(repo)
      fs.writeFileSync(STATE_PATH, JSON.stringify(state, undefined, 2))
    }
  }

  log('Done.')
}

async function postRepoToDiscord (repo) {
  const channel = await discord.channels.fetch(discordSecret.channelId)
  const message = `\`${repo.owner}\` just published \`${repo.name}\`${repo.description ? ` ${repo.description}` : ''} ${repo.url}`
  await channel.send(message)
  log(`Posted "${message}"`)
}

function log (str) {
  console.log(`${new Date()} - ${str}`)
}
