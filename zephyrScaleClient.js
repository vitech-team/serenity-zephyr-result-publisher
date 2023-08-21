const RestClient = require('./restClient.js');

class ZephyrScaleClient extends RestClient {
    constructor({ domain, apiToken, projectKey }) {
        super();
        this._validate({ domain });
        this._validate({ apiToken });
        this._validate({ projectKey });

        this.options = { domain, apiToken, projectKey };
        this.base = `https://${this.options.domain}/v2/`;
        this.headers = {
            "Authorization": `Bearer ${this.options.apiToken}`,
            "Content-Type": "application/json; charset=utf-8"
        };
    }

    getDateNow() {
        const now = new Date();
        return now.toDateString();
    }

    async addTestRunCycle(projectKey = this.options.projectKey, testRunName = `Run: ${process.env.RUN_ID} / Branch: ${process.env.BRANCH_NAME} (${this.getDateNow()})`, folderId = this.options.testCycleFolder) {
        const requestBody = {
            "projectKey": projectKey,
            "name": testRunName,
            "folderId": folderId
        };
        const response = await this._post(`testcycles`, requestBody);
        return response['key'];
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
        return response['key'];
    }

    async addStepsToTestCase(testCaseId, steps) {
        const requestBody = {
            "mode": "OVERWRITE",
            "items": steps
        };
        await this._post(`testcases/${testCaseId}/teststeps`, requestBody);
    }

    async addFolderId(name, parentId = this.options.parentId) {
        const requestBody = {
            "name": name,
            "parentId": parentId,
            "projectKey": this.options.projectKey,
            "folderType": "TEST_CASE"
        };
        const response = await this._post(`folders`, requestBody);
        return response['id'];
    }

    filterJson(json, key, value) {
        return json.filter(item => item[key] === value);
    }

    async getDataDictFromApiByParams(api, key, value) {
        const data = (await this._get(api)).values;
        const dict = {};
        for (const item of data) {
            dict[item[key]] = item[value];
        }
        return dict;
    }

    getDataDictByParams(data, key, value) {
        const dict = {};
        for (const item of data) {
            dict[item[key]] = item[value];
        }
        return dict;
    }

    async getTestCaseIdByTitle(title, folderId) {
        const data = (await this._get(`testcases?projectKey=${this.options.projectKey}&folderId=${folderId}&maxResults=4000`)).values;
        const dataDict = this.getDataDictByParams(data, 'name', 'key');
        const cases = dataDict[title] ? [dataDict[title]] : [];
        if (cases.length > 1) {
            throw new Error(`In section ${folderId} were found ${cases.length} cases with the same test case name - ${title}`);
        } else if (cases.length === 0) {
            return await this.addTestCase(title, folderId);
        } else {
            return cases[0];
        }
    }

    async getFolderIdByTitle(folderName, title) {
        if (folderName === undefined) {
            throw new Error(`TestCase "${title}" does not have suite name, please add it`);
        }
        if (!this.data) {
            this.data = (await this._get(`folders?projectKey=${this.options.projectKey}&folderType=TEST_CASE&maxResults=200`)).values;
        }
        this.data = this.filterJson(this.data, 'parentId', this.options.parentId);
        const dataDict = this.getDataDictByParams(this.data, 'name', 'id');
        const folders = dataDict[folderName] ? [dataDict[folderName]] : [];
        if (folders.length > 1) {
            throw new Error(`In project ${this.options.projectKey} were found ${folders.length} folders with the same folder name - ${folderName}`);
        } else if (folders.length === 0) {
            return await this.addFolderId(folderName);
        } else {
            return folders[0];
        }
    }

    async addTestCaseIssueLink(testCaseKey, issueId) {
        if (issueId) {
            for (const id of issueId) {
                const requestBody = {
                    "issueId": id
                };
                await this._post(`testcases/${testCaseKey}/links/issues`, requestBody, undefined, true);
            }
        }
    }

    async publishResults(cycleKey, testCaseKey, testCaseResult, stepResult) {
        const requestBody = {
            "projectKey": this.options.projectKey,
            "testCycleKey": cycleKey,
            "testCaseKey": testCaseKey,
            "statusName": testCaseResult,
            "testScriptResults": stepResult
        };
        await this._post(`testexecutions`, requestBody, undefined);
    }
}

module.exports = ZephyrScaleClient;