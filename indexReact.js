const PublishReactTestResults = require("./publishReactTestResults.js");

let publish = new PublishReactTestResults()

let start = Date.now()
publish.processResults()
console.log(`Elapsed time: ${(Date.now()-start)/1000}`)
