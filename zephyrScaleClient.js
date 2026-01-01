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
        this.foldersCache = null;

    }


    /**
     * Returns current date in 'Mon Jan 1 2020' format
     * @return {string}
     */
    getDateNow() {
        let now = new Date(Date.now())
        return now.toDateString()
    }

    /**
     * Creates testRunCycle in Zephyr Scale via API
     * @return testRunId of created testRun
     * @param testRunNamePrefix
     * @param projectKey
     * @param folderId
     */
    async addTestRunCycle(testRunNamePrefix = "Run:", projectKey = this.options.projectKey, folderId = this.options.testCycleFolder) {
        let testRunName = `${testRunNamePrefix} ${process.env.RUN_ID} / Branch: ${process.env.BRANCH_NAME} (${this.getDateNow()})`
        let requestBody = {
            "projectKey": projectKey,
            "name": testRunName,
            "folderId": folderId
        }
        let response = await this._post(`testcycles`, requestBody)
        return response['key'];
    }

    /**
     * Creates testCase in Zephyr Scale via API
     * @param name
     * @param folderId
     * @return testCaseId of created testCase
     */
    async addTestCase(name, folderId) {
        let requestBody = {
            "projectKey": this.options.projectKey,
            "name": name,
            "folderId": folderId,
            "statusName": 'Approved',
            "ownerId": this.options.ownerId
        }
        let response = await this._post(`testcases`, requestBody)
        return response['key']
    }

    /**
     * Add steps to testCase in Zephyr Scale via API
     * @param testCaseId
     * @param steps
     */
    async addStepsToTestCase(testCaseId, steps) {
        let requestBody = {
            "mode": "OVERWRITE",
            "items": steps
        }
        await this._post(`testcases/${testCaseId}/teststeps`, requestBody)
    }

    /**
     * Creates Folder in Zephyr Scale via API
     * @param name
     * @return folderId of created section
     */
    async addFolderId(name, parentId = this.options.parentId) {
        let requestBody = {
            "name": name,
            "parentId": parentId,
            "projectKey": this.options.projectKey,
            "folderType": "TEST_CASE"
        }
        let response = await this._post(`folders`, requestBody)
        this._invalidateFoldersCache();
        return response['id']
    }

    filterJson(json, key, value) {
        let filtered = json.filter(a => a[key] == value);
        return filtered
    }

    /**
     * Gets data and returns data matched to key and value
     * @param data
     * @param key
     * @param value
     * @return {{}}
     */
    getDataDictByParams(data, key, value) {
        let dict = {};
        for (let i = 0; i < data.length; i++) {
            dict[data[i][key]] = data[i][value];
        }
        return dict
    }

    /**
     * Gets testCaseId based on title and section
     * in cases there is no such testCase in section, it will be created
     * @param title
     * @param folderId
     * @return testCaseId
     */
    async getTestCaseIdByTitle(title, folderId) {
        let data = await this._get(`testcases?projectKey=${this.options.projectKey}&folderId=${folderId}&maxResults=6000`)
        data = data.values
        data = this.getDataDictByParams(data, 'name', 'key')
        let cases = [];
        for (let name in data) {
            if (name === title) {
                cases.push(data[name])
            }
        }
        if (cases.length > 1) {
            throw new Error(`In section ${folderId} were found ${cases.length} cases with the same test case name - ${title}`)
        } else if (cases.length === 0) {
            return await this.addTestCase(title, folderId)
        } else {
            return cases[0]
        }
    }

    /**
     * Fetches and caches all folders
     * @return folders data
     */
    async _getFoldersData() {

        if (this.foldersCache === null) {
            const allFolders = [];
            let startAt = 0;
            const maxResults = 1000;
            let isLast = false;

            while (!isLast) {
                const data = await this._get(`folders?projectKey=${this.options.projectKey}&folderType=TEST_CASE&maxResults=${maxResults}&startAt=${startAt}`);
                if (data && Array.isArray(data.values)) {
                    allFolders.push(...data.values);
                    isLast = data.isLast;
                    startAt += data.values.length;
                } else {
                    isLast = true;
                }
            }
            this.foldersCache = allFolders;
        }

        return this.foldersCache;
    }

    /**
     * Invalidates the folders cache
     */
    _invalidateFoldersCache() {
        this.foldersCache = null;
    }

    /**
     * Gets folderId based on title
     * in cases there is no such section, it will be created
     * @param folderName
     * @return folderId
     */
    async getFolderIdByTitle(folderName) {
        if (folderName === undefined) {
            throw new Error(`Test case is missing a suite name (folder name is undefined)`)
        }
        let data = await this._getFoldersData();
        data = this.filterJson(data, 'parentId', this.options.parentId)
        data = this.getDataDictByParams(data, 'name', 'id')
        let folders = [];
        for (let name in data) {
            if (name === folderName) {
                folders.push(data[name])
            }
        }
        if (folders.length === 0) {
            return await this.addFolderId(folderName)
        } else {
            return folders[0]
        }
    }

    /**
     * Add link between testCase in Zephyr and Jira ticket (only if not already linked)
     * @param testCaseKey
     * @param issueId
     */
    async addTestCaseIssueLink(testCaseKey, issueId) {
        if (issueId) {
            for (let i in issueId) {
                try {
                    let requestBody = {
                        "issueId": issueId[i]
                    }
                    await this._post(`testcases/${testCaseKey}/links/issues`, requestBody, undefined, this.headers)
                } catch (error) {
                    if (error.error && (error.error.status === 400 || error.error.status === 409)) {
                        console.log(`  Test case ${testCaseKey} already linked to issue ${issueId[i]}, skipping`);
                    } else {
                        console.error(`  Failed to link test case ${testCaseKey} to issue ${issueId[i]}:`, error.error?.statusText || error.message);
                    }
                }
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
