const Obniz = require('obniz');
const AWS = require('aws-sdk');
const axios = require('axios');

const obniz = new Obniz('9114-7950');
const lineNotifyToken = '00bKud7Cg4lT2ezdlDs0RiZmi9LZFgNMIzRg38UQcSK';
const AWS_REGION = 'ap-northeast-1';
const TABLE_NAME = 'heatstroke_data';
const DEVICE_ID = 'obniz-010';

// AWS SDKの設定
AWS.config.update({ region: AWS_REGION });
const dynamoDB = new AWS.DynamoDB.DocumentClient();

obniz.onconnect = async function () {
  var speaker = obniz.wired('Keyestudio_Buzzer', { signal: 0, vcc: 1, gnd: 2 });
  var light = obniz.wired('Keyestudio_TrafficLight', { gnd: 8, green: 7, yellow: 6, red: 5 });
  var tempsens = obniz.wired('Keyestudio_TemperatureSensor', { signal: 9, vcc: 10, gnd: 11 });

  let lastSent = Date.now();
  let interval;
  let i = 0;
  while (true) {
    i++;

    if (i > 3600) {
      speaker.stop();
      break;
    }

    const temp = await tempsens.getWait();
    console.log(temp.toFixed(1));

    var message = '';
    if (temp < 23) {
      light.single('green'); // green
      await obniz.wait(100);
      light.green.off();
      await obniz.wait(1900);
      interval = 4 * 60 * 1000; // 4分
      message = '現在の温度は ' + temp.toFixed(1) + '℃です。平温です。';
    } else if (temp < 32) {
      // speaker.play(400); // 400 Hzの音を再生
      light.single('yellow'); // yellow
      await obniz.wait(200);
      speaker.stop();
      light.yellow.off();
      await obniz.wait(800);
      interval = 2 * 60 * 1000; // 2分
      message = '現在の温度は ' + temp.toFixed(1) + '℃です。やや高温です。積極的に休憩・水分補給を促しましょう。';
    } else {
      // speaker.play(700); // 700 Hzの音を再生
      light.single('red'); // red
      await obniz.wait(300);
      speaker.stop();
      light.red.off();
      await obniz.wait(700);
      interval = 40 * 1000; // 40秒
      message = '現在の温度は ' + temp.toFixed(1) + '℃です。高温です。設置場所の状態が熱中症警戒状態になりました。相手と連絡を取り、取れない場合は早急な対応をしてください。';
    }

    // LINEへの警告メッセージ送信
    const now = Date.now();
    if (now - lastSent >= interval) {
      console.log('Sending message to Line...');
      axios
        .post('https://notify-api.line.me/api/notify', `message=${message}`, {
          headers: {
            Authorization: `Bearer ${lineNotifyToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
        .then((res) => {
          console.log('Message sent to Line successfully.');
          lastSent = now;
        })
        .catch((error) => {
          console.error('Error sending message: ', error);
        });
    }

    // DynamoDBへのデータ保存
    const timestamp = Math.floor(Date.now() / 1000); // タイムスタンプを秒単位に変換
    const temperature = Number(temp.toFixed(1)); // 温度を小数第1位までの数値に変換
    const params = {
      TableName: TABLE_NAME,
      Item: {
        deviceId: DEVICE_ID,
        timestamp: timestamp,
        temperature: temperature,
      },
    };

    dynamoDB.put(params, function (err, data) {
      if (err) {
        console.error('Error saving data to DynamoDB: ', err);
      } else {
        console.log('Data saved to DynamoDB successfully: ', data);
      }
    });
  }
};

// 無限ループを防ぐため、一定時間（ここでは1時間）後にプログラムを終了
setTimeout(() => {
  process.exit(0);
}, 3600 * 1000);
