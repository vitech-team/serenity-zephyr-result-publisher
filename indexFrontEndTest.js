const PublishFrontendUnitTestResults = require("./publishFrontendUnitTestResults.js");

let publish = new PublishFrontendUnitTestResults()

let start = Date.now()
publish.processResults()
console.log(`Elapsed time: ${(Date.now()-start)/1000}`)
