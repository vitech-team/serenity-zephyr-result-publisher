const fs = require('fs')
const ZephyrScaleClient = require('./zephyrScaleClient.js')
const JiraClient = require('./jiraClient.js')


class PublishResults {
    zephyr = new ZephyrScaleClient(
        {
            'domain': process.env.ZEPHYR_DOMAIN,
            'apiToken': process.env.ZEPHYR_TOKEN,
            'projectKey': process.env.ZEPHYR_PROJECT_KEY,
            'parentId': process.env.ZEPHYR_FOLDER_PARENT_ID,
            'ownerId': process.env.ZEPHYR_OWNER_ID,
            'testCycleFolder': process.env.ZEPHYR_TEST_CYCLE_FOLDER
        });

    jira = new JiraClient(
        {
            'domain': process.env.JIRA_DOMAIN,
            'apiToken': process.env.JIRA_TOKEN
        });


    status = {
        'SUCCESS': 'pass',
        'ERROR': 'fail',
        'FAILURE': 'fail',
        'SKIPPED': 'not executed'
    };


    getListOfFiles(src = process.env.JSON_INPUT_PATH) {
        let jsonFiles = [];
        let files = fs.readdirSync(src)
        files.forEach(file => {
            if (file.includes('json')) {
                jsonFiles.push(file)
            }
            ;
        });
        return jsonFiles;
    }

    readContent(filename) {
        return JSON.parse(fs.readFileSync(process.env.JSON_INPUT_PATH + filename))
    }

    addStep(step) {
        return {
            "inline": {
                "description": step
            }
        }
    }


    addActualResult(step) {
        let actualResult = ''
        if (step.screenshots) {
            let imgUrl = `https://${process.env.SERENITY_REPORT_DOMAIN}/${process.env.RUN_ID}/${step.screenshots[0].screenshot}`
            let resultImg = `<img src="${imgUrl}" />`
            actualResult = actualResult.concat(resultImg)
        }
        if (step.exception) {
            let exception = JSON.stringify(step.exception, undefined, 4)
            exception = exception.replace(/\n/g, `<br>`)
            exception = exception.replace(/\s/g, `&emsp;`)
            actualResult = actualResult.concat(`<b>Stacktrace:</b><br>${exception}`)
        }
        return actualResult
    }

    addStepResult(step) {
        let result = {}
        if (step.result == undefined) {
            step.children.forEach(child => {
                if (['FAILURE', 'ERROR'].includes(child.result)){
                    step = child
                }
            })
        }
        result.statusName = this.status[step.result]
        let actualResult = this.addActualResult(step)
        if (actualResult) {
            result.actualResult = actualResult
        }
        return result;
    }

    // processResults() {
    //
    //     let cycleKey = this.zephyr.addTestRunCycle()
    //     let jsonFiles = this.getListOfFiles();
    //     for (let fileNameSequence = 0; fileNameSequence < jsonFiles.length; fileNameSequence++) {
    //         let json = this.readContent(jsonFiles[fileNameSequence]);
    //         let issueId = this.jira.getIssueIdByKey(json.coreIssues)
    //         let folderName = json.featureTag.name.split('/')[0];
    //         let folderId = this.zephyr.getFolderIdByTitle(folderName);
    //         let suiteName = json.featureTag.name.split('/')[1];
    //         for (let testCaseSequence = 0; testCaseSequence < json.testSteps.length; testCaseSequence++) {
    //             let testCaseName = suiteName;
    //             for (let paramSequence = 0; paramSequence < json.dataTable.rows[testCaseSequence].values.length; paramSequence++) {
    //                 testCaseName = testCaseName + `: ${json.dataTable.rows[testCaseSequence].values[paramSequence]}`
    //             }
    //             let steps = []
    //             let stepResult = []
    //             let testCaseKey = this.zephyr.getTestCaseIdByTitle(testCaseName, folderId)
    //             this.zephyr.addTestCaseIssueLink(testCaseKey, issueId)
    //             let testSteps = json.testSteps[testCaseSequence].children;
    //             let testCaseResult = this.status[json.testSteps[testCaseSequence].result]
    //             testSteps.forEach(step => {
    //                 steps.push(this.addStep(step.description))
    //                 stepResult.push(this.addStepResult(step))
    //             });
    //             this.zephyr.addStepsToTestCase(testCaseKey, steps)
    //             this.zephyr.publishResults(cycleKey, testCaseKey, testCaseResult, stepResult)
    //         }
    //
    //     }
    //
    // }

    async processResults() {
        let cycleKey = await this.zephyr.addTestRunCycle();
        let jsonFiles = this.getListOfFiles();
        for (const fileNameSequence of jsonFiles) {
            let json = this.readContent(jsonFiles[fileNameSequence]);
            let issueId = await this.jira.getIssueIdByKey(json.coreIssues);
            let folderName = json.featureTag.name.split('/')[0];
            let folderId = await this.zephyr.getFolderIdByTitle(folderName);
            let suiteName = json.featureTag.name.split('/')[1];
            for (const testCaseSequence of json.testSteps) {
                let testCaseName = suiteName;
                for (let paramSequence = 0; paramSequence < json.dataTable.rows[testCaseSequence].values.length; paramSequence++) {
                    testCaseName = testCaseName + `: ${json.dataTable.rows[testCaseSequence].values[paramSequence]}`;
                }
                let steps = [];
                let stepResult = [];
                let testCaseKey = await this.zephyr.getTestCaseIdByTitle(testCaseName, folderId);
                await this.zephyr.addTestCaseIssueLink(testCaseKey, issueId);
                let testSteps = json.testSteps[testCaseSequence].children;
                let testCaseResult = this.status[json.testSteps[testCaseSequence].result];
                testSteps.forEach(step => {
                    steps.push(this.addStep(step.description));
                    stepResult.push(this.addStepResult(step));
                });
                await this.zephyr.addStepsToTestCase(testCaseKey, steps);
                await this.zephyr.publishResults(cycleKey, testCaseKey, testCaseResult, stepResult);
            }
        }
    }

    // async processResults() {
    //     let cycleKey = await this.zephyr.addTestRunCycle();
    //     let jsonFiles = this.getListOfFiles();
    //     let processFiles = jsonFiles.map(async (_, fileNameSequence) => {
    //         let json = this.readContent(jsonFiles[fileNameSequence]);
    //         let issueId = await this.jira.getIssueIdByKey(json.coreIssues);
    //         let folderName = json.featureTag.name.split('/')[0];
    //         let folderId = await this.zephyr.getFolderIdByTitle(folderName);
    //         let suiteName = json.featureTag.name.split('/')[1];
    //         let processTestCases = json.testSteps.map(async (_, testCaseSequence) => {
    //             let testCaseName = suiteName;
    //             for (let paramSequence = 0; paramSequence < json.dataTable.rows[testCaseSequence].values.length; paramSequence++) {
    //                 testCaseName = testCaseName + `: ${json.dataTable.rows[testCaseSequence].values[paramSequence]}`;
    //             }
    //             let steps = [];
    //             let stepResult = [];
    //             let testCaseKey = await this.zephyr.getTestCaseIdByTitle(testCaseName, folderId);
    //             await this.zephyr.addTestCaseIssueLink(testCaseKey, issueId);
    //             let testSteps = json.testSteps[testCaseSequence].children;
    //             let testCaseResult = this.status[json.testSteps[testCaseSequence].result];
    //             let processStepPromises = testSteps.map(async (step) => {
    //                 steps.push(this.addStep(step.description));
    //                 stepResult.push(this.addStepResult(step));
    //             });
    //             await Promise.all(processStepPromises);
    //             await this.zephyr.addStepsToTestCase(testCaseKey, steps);
    //             await this.zephyr.publishResults(cycleKey, testCaseKey, testCaseResult, stepResult);
    //         });
    //         await Promise.all(processTestCases);
    //     });
    //     await Promise.all(processFiles);
    // }

}

module.exports = PublishResults;
