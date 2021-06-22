import { Octokit } from '@octokit/rest'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import Discord from 'discord.js'
import { stripIndent } from 'common-tags'

import { discord as discordSecret } from './secret/index.js'

const DB_PATH = join(dirname(fileURLToPath(import.meta.url)), 'db')
const STATE_PATH = join(DB_PATH, 'state.json')
const DISCORD_PREFIX = '!'

let state = {
  usernames: [],
  repos: {},
  stars: []
}

const octokit = new Octokit()
const discord = new Discord.Client()
discord.login(discordSecret.botToken)
discord.on('ready', init)

async function init () {
  await fs.mkdir(DB_PATH, { recursive: true })

  try {
    state = JSON.parse(await fs.readFile(STATE_PATH, 'utf8'))
  } catch (err) {
    // First run of the program
  }
  setupBotCommands()

  checkRepos()
  setInterval(checkRepos, 60 * 60 * 1000) // 1 hour

  checkStars()
  setInterval(checkStars, (60 * 60 * 1000) + 20) // 1 hour
}

async function saveState () {
  await fs.writeFile(STATE_PATH, JSON.stringify(state, undefined, 2))
}

async function checkRepos (usernames = state.usernames) {
  if (typeof usernames === 'string') usernames = [usernames]
  for (const username of usernames) {
    if (!state.repos[username]) state.repos[username] = []

    const res = await octokit.repos.listForUser({
      username,
      per_page: 100,
      sort: 'created',
      direction: 'desc'
    })

    if (res.status !== 200) {
      throw new Error(`Non-200 response: ${res.status} ${JSON.stringify(res.data)}`)
    }

    const repos = res.data
      .map(repo => ({
        name: repo.name,
        description: repo.description,
        fork: repo.fork,
        url: repo.html_url,
        owner: repo.owner.login,
        createdAt: new Date(repo.created_at)
      }))
      .filter(repo => !repo.fork)
      .filter(repo => repo.createdAt > Date.now() - (7 * 24 * 60 * 60 * 1000)) // not older than 1 week
      .filter(repo => !state.repos[username].includes(repo.name))

    for (const repo of repos) {
      state.repos[username].push(repo.name)
      await saveState()
      await postRepo(repo)
    }
  }

  log('checkRepos Done')
}

async function checkStars (usernames = state.usernames) {
  if (typeof usernames === 'string') usernames = [usernames]
  for (const username of usernames) {
    if (!state.stars) state.stars = []

    const res = await octokit.activity.listReposStarredByUser({ username, per_page: 3 })

    const repos = res.data
      .map(repo => ({
        name: repo.name,
        description: repo.description,
        fork: repo.fork,
        url: repo.html_url,
        owner: repo.owner.login,
        createdAt: new Date(repo.created_at)
      }))
      .filter(repo => !state.stars.includes(repo.name))
      .filter(repo => !usernames.includes(repo.owner.login))

    for (const repo of repos) {
      state.stars.push(repo.name)
      await saveState()
      await postStarredRepo(username, repo)
    }
  }
  log('checkStars Done')
}

async function postRepo (repo) {
  const channel = await discord.channels.fetch(discordSecret.channelId)
  const message = `\`${repo.owner}\` just published \`${repo.name}\`${repo.description ? ` ${repo.description}` : ''} ${repo.url}`
  await channel.send(message)
  log(`Posted "${message}"`)
}

async function postStarredRepo (username, repo) {
  const channel = await discord.channels.fetch(discordSecret.channelId)
  const message = `\`${username}\` just starred \`${repo.name}\`${repo.description ? ` ${repo.description}` : ''} ${repo.url}`
  await channel.send(message)
  log(`Posted "${message}"`)
}

async function setupBotCommands () {
  discord.on('message', async message => {
    if (message.channel.id !== discordSecret.channelId) return
    if (message.author.bot) return
    if (!message.content.startsWith(DISCORD_PREFIX)) return

    const commandBody = message.content.slice(DISCORD_PREFIX.length)
    const args = commandBody.split(' ')
    const command = args.shift().toLowerCase()

    if (command === 'help') {
      message.reply(stripIndent`
        \`\`\`
        !help               print this message
        !ping               test bot latency
        !add [username]     add a github username to watch list
        !remove [username]  remove a github username from watch list
        !list               list watched usernames
        \`\`\`
      `)
    } else if (command === 'ping') {
      const timeTaken = Date.now() - message.createdTimestamp
      message.reply(`Pong! This message had a latency of ${timeTaken}ms.`)
    } else if (command === 'add') {
      if (args.length !== 1) {
        message.reply('usage: `!add [username]`')
        return
      }

      const username = args[0]
      if (state.usernames.includes(username)) {
        message.reply(`${username} is already added`)
        return
      }

      state.usernames.push(username)
      await saveState()

      message.reply(`I added \`${username}\`. I'll post whenever they publish a new repo.`)

      checkRepos(username)
    } else if (command === 'remove') {
      if (args.length !== 1) {
        message.reply('usage: `!remove [username]`')
        return
      }

      const username = args[0]
      if (!state.usernames.includes(username)) {
        message.reply(`${username} is not added`)
        return
      }

      state.usernames.splice(state.usernames.indexOf(username), 1)
      await saveState()

      message.reply(`I removed \`${username}\`. I'll no longer post when they publish a new repo.`)
    } else if (command === 'list') {
      const usernamesStr = state.usernames.map(username => `\`${username}\``).join(', ')
      message.reply(`I'm posting whenever these users publish a new repo: ${usernamesStr}.`)
    }
  })
}

function log (str) {
  console.log(`${new Date()} - ${str}`)
}
