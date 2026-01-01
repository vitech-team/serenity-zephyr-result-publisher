const ZephyrScaleClient = require('./zephyrScaleClient.js')
const JiraClient = require('./jiraClient.js')

class BasePublisher {
    constructor() {
        this.zephyr = new ZephyrScaleClient(
            {
                'domain': process.env.ZEPHYR_DOMAIN,
                'apiToken': process.env.ZEPHYR_TOKEN,
                'projectKey': process.env.ZEPHYR_PROJECT_KEY,
                'parentId': process.env.ZEPHYR_FOLDER_PARENT_ID,
                'ownerId': process.env.ZEPHYR_OWNER_ID,
                'testCycleFolder': process.env.ZEPHYR_TEST_CYCLE_FOLDER
            });

        this.jira = new JiraClient(
            {
                'domain': process.env.JIRA_DOMAIN,
                'apiToken': process.env.JIRA_TOKEN
            });
    }

    addStep(step) {
        return {
            "inline": {
                "description": step
            }
        }
    }
}

module.exports = BasePublisher;
