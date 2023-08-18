const RestClient = require('./restClient.js')


/**
 * Zephyr Scale basic API wrapper
 */
class ZephyrScaleClient extends RestClient {

    /**
     * Zephyr Scale constructor
     *
     * @param options
     */
    constructor(options) {
        super();
        this._validate(options, 'domain');
        this._validate(options, 'apiToken');
        this._validate(options, 'projectKey');

        this.options = options;
        this.base = `https://${this.options.domain}/v2/`;
        this.headers = {
            "Authorization": `Bearer ${this.options.apiToken}`,
            "Content-Type": "application/json; charset=utf-8"
        }
        this.folderData = null;
    }

    getDateNow() {
        return new Date().toDateString();
    }

    async addTestRunCycle(projectKey = this.options.projectKey, testRunName = `Run: ${process.env.RUN_ID} / Branch: ${process.env.BRANCH_NAME} (${this.getDateNow()})`, folderId = this.options.testCycleFolder) {
        const requestBody = {
            "projectKey": projectKey,
            "name": testRunName,
            "folderId": folderId
        };
        const response = await this._post(`testcycles`, requestBody);
        return response.key;
    }

    async addTestCase(name, folderId) {
        const requestBody = {
            "projectKey": this.options.projectKey,
            "name": name,
            "folderId": folderId,
            "statusName": 'Approved',
            "ownerId": this.options.ownerId
        };
        const response = await this._post(`testcases`, requestBody);
        return response.key;
    }

    async addStepsToTestCase(testCaseId, steps) {
        const requestBody = {
            "mode": "OVERWRITE",
            "items": steps
        };
        await this._post(`testcases/${testCaseId}/teststeps`, requestBody);
    }

    async fetchFolderData() {
        if (!this.folderData) {
            try {
                this.folderData = await this._get(`folders?projectKey=${this.options.projectKey}&folderType=TEST_CASE&maxResults=200`);
                this.folderData = this.folderData.values || [];
            } catch (error) {
                throw new Error(`Error while fetching folder data: ${error.message}`);
            }
        }
    }

    async getFolderIdByTitle(folderName, title) {
        if (!folderName) {
            throw new Error(`TestCase "${title}" does not have a suite name. Please add it.`);
        }

        await this.fetchFolderData();

        const data = this.folderData.filter(item => item.parentId === this.options.parentId);
        const folderIdMap = this.getDataDictByParams(data, 'name', 'id');
        const folderId = folderIdMap[folderName];

        if (!folderId) {
            return this.addFolderId(folderName);
        }

        return folderId;
    }

    /**
     * Add link between testCase in Zephyr and Jira ticket
     * @param testCaseId
     * @param issueId
     */
    async addTestCaseIssueLink(testCaseKey, issueId) {
        if (issueId) {
            for (let i in issueId) {
                let requestBody = {
                    "issueId": issueId[i]
                }
                await this._post(`testcases/${testCaseKey}/links/issues`, requestBody, undefined, true)
            }
        }
    }

    /**
     * Publish results into Zephyr Scale via API
     * @param cases
     * @param results
     */
    async publishResults(cycleKey, testCaseKey, testCaseResult, stepResult) {
        let requestBody = {
            "projectKey": this.options.projectKey,
            "testCycleKey": cycleKey,
            "testCaseKey": testCaseKey,
            "statusName": testCaseResult,
            "testScriptResults": stepResult
        }
        await this._post(`testexecutions`, requestBody, undefined)
    }

}

module.exports = ZephyrScaleClient;
