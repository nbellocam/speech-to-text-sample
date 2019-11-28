const sdk = require("microsoft-cognitiveservices-speech-sdk");
const fs = require("fs");
const extractAudio = require('ffmpeg-extract-audio');


const subscriptionKey = "{your-subscription-key-here}";
const serviceRegion = "{your-service-region-here}"; // e.g., "westus"
const videoFile = "your-file.mp4";
const audioFile = "your-file.wav"; // 16000 Hz, Mono
const outputFile = "transcript.vtt";
const language = "en-US";


function createAudioConfig(filename) {
    const pushStream = sdk.AudioInputStream.createPushStream();

    fs.createReadStream(filename).on('data', arrayBuffer => {
        pushStream.write(arrayBuffer.slice());
    }).on('end', () => {
        pushStream.close();
    });

    return sdk.AudioConfig.fromStreamInput(pushStream);
}

function createRecognizer(audiofilename, audioLanguage) {
    const audioConfig = createAudioConfig(audiofilename);
    const speechConfig = sdk.SpeechConfig.fromSubscription(subscriptionKey, serviceRegion);
    speechConfig.speechRecognitionLanguage = audioLanguage;

    return new sdk.SpeechRecognizer(speechConfig, audioConfig);
}

function parseTime(nano) {
    var hour = Math.floor(nano / 36000000000);
    var temp = nano % 36000000000;
    var minute = Math.floor(temp / 600000000);
    var temp2 = temp % 600000000;
    var second = Math.floor(temp2 / 10000000);
    var mil = temp2 % 10000000;
    hour = hour.toString();
    minute = minute.toString();
    second = second.toString();
    mil = mil.toString().slice(0, 3) //cuts off insignificant digits
    return `${hour}:${minute}:${second}.${mil}`
}


function processFile(filename) {
    const outputStream = fs.createWriteStream(outputFile);
    outputStream.once('open', () => {
        outputStream.write(`WEBVTT\r\n\r\n`);

        let recognizer = createRecognizer(filename, language);

        recognizer.recognized = (s, e) => {
            if (e.result.reason === sdk.ResultReason.NoMatch) {
                const noMatchDetail = sdk.NoMatchDetails.fromResult(e.result);
                console.log("\r\n(recognized)  Reason: " + sdk.ResultReason[e.result.reason] + " | NoMatchReason: " + sdk.NoMatchReason[noMatchDetail.reason]);
            } else {
                console.log(`\r\n(recognized)  Reason: ${sdk.ResultReason[e.result.reason]} | Duration: ${e.result.duration} | Offset: ${e.result.offset}`);
                
                outputStream.write(`${parseTime(e.result.offset)} --> ${parseTime(e.result.offset + e.result.duration)}\r\n`);
                outputStream.write(`${e.result.text}\r\n\r\n`);
            }
        };

        recognizer.canceled = (s, e) => {
            let str = "(cancel) Reason: " + sdk.CancellationReason[e.reason];
            if (e.reason === sdk.CancellationReason.Error) {
                str += ": " + e.errorDetails;
            }

            console.log(str);
        };

        recognizer.speechEndDetected = (s, e) => {
            console.log(`(speechEndDetected) SessionId: ${e.sessionId}`);
            outputStream.close();
            recognizer.close();
            recognizer = undefined;
        };

        recognizer.startContinuousRecognitionAsync(() => {
                console.log('Recognition started');
            },
            err => {
                console.trace("err - " + err);
                outputStream.close();
                recognizer.close();
                recognizer = undefined;
            });
    });
}

extractAudio({
    input: videoFile,
    output: audioFile,
    transform: (cmd) => {
      cmd.audioChannels(1)
          .audioFrequency(16000);
    }
  }).then(() => {
      console.log('Sound ready');
      processFile(audioFile);
  });
