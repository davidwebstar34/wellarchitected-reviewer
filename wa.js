let AWS = require('aws-sdk');
let fs = require('fs');
let { Parser } = require('json2csv');
let { transforms: { unwind } } = require('json2csv');

AWS.config.update({ region: 'eu-west-1' });
let wellarchitected = new AWS.WellArchitected();

let workload = {
    fields: ['workload.WorkloadSummaries.WorkloadId', 'workload.WorkloadSummaries.WorkloadName', 'workload.WorkloadSummaries.Owner',
        'workload.WorkloadSummaries.Lenses', 'workload.WorkloadSummaries.RiskCounts.NONE', 'workload.WorkloadSummaries.RiskCounts.NOT_APPLICABLE',
        'workload.WorkloadSummaries.RiskCounts.MEDIUM', 'workload.WorkloadSummaries.RiskCounts.HIGH', 
        'answers.AnswerSummaries.QuestionId', 'answers.AnswerSummaries.PillarId', 'answers.AnswerSummaries.Risk'],
    transforms: [unwind({
        paths: ['workload.WorkloadSummaries', 'workload.WorkloadSummaries.Lenses', 'answers', 'answers.AnswerSummaries']
    })]
};

let workloadChoices = {
    fields: ['workload.WorkloadSummaries.WorkloadId', 'workload.WorkloadSummaries.WorkloadName', 'workload.WorkloadSummaries.Owner',
        'workload.WorkloadSummaries.Lenses', 'workload.WorkloadSummaries.RiskCounts.NONE', 'workload.WorkloadSummaries.RiskCounts.NOT_APPLICABLE',
        'workload.WorkloadSummaries.RiskCounts.MEDIUM', 'workload.WorkloadSummaries.RiskCounts.HIGH',
        'answers.AnswerSummaries.QuestionId', 'answers.AnswerSummaries.PillarId', 'answers.AnswerSummaries.Risk',
        , 'answers.AnswerSummaries.Choices.Selected', 'answers.AnswerSummaries.Choices.ChoiceId'],
    transforms: [unwind({
        paths: ['workload.WorkloadSummaries', 'workload.WorkloadSummaries.Lenses', 'answers', 'answers.AnswerSummaries',
        'answers.AnswerSummaries.Choices']
    })]
}

async function getWorkloads() {
    let params = {
        MaxResults: '50',
    };
    return wellarchitected.listWorkloads(params).promise()
}

async function getMilestones(workloadID) {
    let params = {
        WorkloadId: workloadID, /* required */
        MaxResults: '50'
    };
    return wellarchitected.listMilestones(params).promise();
}

async function getAnswers(workloadID, lens) {
    let pillars = []
    let arr = ["reliability", "operationalExcellence", "security", "costOptimization", "performance"];
    for (let i = 0; i < arr.length; i++) {
        let params = {
            LensAlias: lens,
            WorkloadId: workloadID,
            MaxResults: '50',
            PillarId: arr[i]
        };

        let wa = wellarchitected.listAnswers(params).promise();
        let pillar = await wa;
        pillars.push(pillar);
    }
    return pillars;
}

async function putObjectToS3(filename, data, fields, transforms, bucket){

    let json2csvParser = new Parser({ fields, transforms });
    let csv = json2csvParser.parse(data);

    var s3client = new AWS.S3();
        var params = {
            Bucket : bucket,
            Key : filename,
            Body : csv
        }

    s3 = s3client.putObject(params).promise();
    result = await s3
}

async function createWorkloadCSV() {

    let workload = await getWorkloads();
    let workloadID = workload.WorkloadSummaries[0].WorkloadId;

    let milestones = await getMilestones(workloadID);

    let lens = 'wellarchitected';  // only WA for now
    let answers = await getAnswers(workloadID, lens);
    
    let dto = {
        answers: answers,
        milestones: milestones,
        workload: workload
    }

    return dto;
}


exports.handler = async function(event) {

    let dto = await createWorkloadCSV();

    await  putObjectToS3('workload.csv', dto, workload.fields, workload.transforms, 'quicksightdw');

    dto.answers.forEach(answer => {
        answer.AnswerSummaries.forEach(summary => {
            summary.Choices.forEach(choice => {
                choice.Selected = summary.SelectedChoices.includes(choice.ChoiceId);
            })
        })
    })

    await putObjectToS3('workloadChoices.csv', dto, workloadChoices.fields, workloadChoices.transforms, 'quicksightdw');

    return null;
}