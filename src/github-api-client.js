/**
 * Fetches all commits which are in the latest release (compares last and second-to-last releases)
 * Picks Jira issue key from the commit message
 */

import { context, getOctokit } from '@actions/github'
import { getInput } from '@actions/core'

const defaultApiParams = { owner: context.repo.owner, repo: context.repo.repo }
const jiraTicketRegex = new RegExp(
  `${getInput('ticket_id_pattern')}`,
  `${getInput('ticket_id_pattern_flags')}`
)

const token = process.env.GITHUB_TOKEN
if (!token) throw new Error('GITHUB_TOKEN is not set')
const github = getOctokit(token)

async function getJiraTicketsFromCommits() {
  const { data: tags } = await github.rest.repos.listTags({
    ...defaultApiParams,
    per_page: 2,
  })
  const [latestTag, previousTag] = tags

  let [latestCommit, previousCommit] = [undefined, undefined]

  if (previousTag) {
    ;[latestCommit, previousCommit] = await Promise.all([
      github.rest.repos.getCommit({
        ...defaultApiParams,
        ref: latestTag.commit.sha,
      }),
      github.rest.repos.getCommit({
        ...defaultApiParams,
        ref: previousTag.commit.sha,
      }),
    ])
  } else {
    latestCommit = await github.rest.repos.getCommit({
      ...defaultApiParams,
      ref: latestTag.commit.sha,
    })
  }

  // If there is a previous release commit we are shifting the last commit's date one second,
  // so to not include the commit from the previous tag. Otherwise default to the earliest date possible
  // to include all commits in the repo.
  let since = new Date('0001-01-01T00:00:00Z').toISOString()
  if (previousCommit) {
    since = new Date(
      new Date(previousCommit.data.commit.committer.date).valueOf() + 1000
    ).toISOString()
  }

  const commits = await github.rest.repos.listCommits({
    ...defaultApiParams,
    since,
    until: latestCommit.data.commit.committer.date,
  })

  const jiraTickets = commits.data
    .map((c) => {
      const regexMatches = jiraTicketRegex.exec(c.commit.message) || []
      log.info(`Commit message: ${c.commit.message}`)
      if (regexMatches.length > 0) {
        log.info(`Found Jira ticket in commit message: ${regexMatches[1]}`)
      }
      return regexMatches[1]
    })
    .filter((el) => el)

  const uniqueJiraTickets = Array.from(new Set(jiraTickets)) // use Set to eliminate duplicate entries
  core.info(`Found ${uniqueJiraTickets.length} unique Jira tickets in commit messages:\r\n${uniqueJiraTickets.join('\r\n')}`);
  return uniqueJiraTickets
}

export default getJiraTicketsFromCommits
