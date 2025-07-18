require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const cookieParser = require('cookie-parser');
const path = require('path');
const app = express();
const port = process.env.PORT || 8080;
const iconv = require('iconv-lite');

// 프록시 신뢰 설정 (nginx, 로드밸런서 등을 통한 경우)
app.set('trust proxy', true);

// CORS 설정 - 특정 IP에서만 접근 허용
app.use(cors({
  origin: ['http://10.40.1.183:5000',
          'http://10.41.0.125:5000/'],
  credentials: true
}));

// JSON 파싱 미들웨어
app.use(express.json());

// 쿠키
app.use(cookieParser());

// .env 파일에서 IP 목록 불러오기
const ipList = JSON.parse(process.env.IP_LIST || '[]');
// 한국식 시간 계산
function getDateTime() {
  return new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(/\. /g, '-').replace(/\./g, '').replace(' ', '-');
}
let clientIp = '';

// window open 시 사용자 ip 확인 후 redirect
app.get('/redirect', (req, res) => {
  console.log(`redirect 시작 gogo`);
  if (!req.cookies.visited) {
    console.log(`!req.cookies.visited 시작`);
    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const InclientIp = rawIp.replace(/^::ffff:/, '');
    clientIp = InclientIp;
    console.log(`접속한 IP: ${InclientIp}`);

    // 방문 쿠키 설정 (1시간 유지)
    res.cookie('visited', 'true', { maxAge: 3600000 });

    const ipParts = InclientIp.split('.');
    console.log(`ipParts: ${ipParts}`);
    const first = parseInt(ipParts[0], 10);
    console.log(`first: ${first}`);
    const second = parseInt(ipParts[1], 10);
    console.log(`second: ${second}`);
    console.log(`${InclientIp} : ${first}, ${second}`);

    if(first === 10 && second === 40){
      console.log(`직원망으로`)
      return res.redirect(`http://10.40.1.183:5000/`);
    } else {
      console.log(`학생망으로`)
      return res.redirect(`http://10.41.0.125:5000/`);
    }
  } else {
    console.log(`!req.cookies.visited 안함`);
    return res.send('이미 접속한 사용자');
  }
});

// IP 목록 반환 API
app.get('/ip-list', (req, res) => {
  const datetime = getDateTime();
  console.log(`실행한 IP: ${clientIp} (${datetime})`);
  console.log('/ip-list 실행');
  res.json({
    ipList: ipList
  });
});

// 로컬 PC 사용자명과 SSH 설정
// const sshUser = 'alpaca'; // ← 여기에 로컬 PC 유저명
// const sshPort = 9000; // Reverse SSH로 열어둔 포트

// 모든 IP에 ping 테스트
app.get('/ping-all', async (req, res) => {
  const datetime = getDateTime();
  console.log(`실행한 IP: ${clientIp} (${datetime})`);
  console.log('/ping-all 실행');

  const pingPromises = ipList.map(({ label, ip }) => {
    return new Promise(resolve => {
      // const sshCommand = `ssh -o ConnectTimeout=2 -p ${sshPort} ${sshUser}@localhost "ping -c 1 ${ip}"`;
      exec(`ping -c 3 ${ip}`, { encoding: 'buffer' }, (error, stdout, stderr) => {
            // stdout을 한글로 변환 (EUC-KR → UTF-8)
            const decodedOutput = iconv.decode(stdout, 'euc-kr'); // 혹은 'cp949'
            let status = '오류';
            let time = null;
            const match = decodedOutput.match(/(?:time=|시간=)([\d.]+)\s*ms/i);
            time = match ? `${match[1]} ms` : null;

            if (!error && time !== null ) {
                 // ping 성공
                status = '응답 완료';
            } else {
                // ping 실패
                status = '응답 없음';
            }
        // console.log(`[진행중] ${label} (${ip}) → ${status}, ${time}`);
        resolve({ label, ip, status, time, stdout: decodedOutput });

      });
    });
  });

  const results = await Promise.all(pingPromises);
  res.json(results);
});

app.use(express.static(path.join(__dirname, '/')));

app.listen(port, () => {
  console.log(`서버 실행 중: http://localhost:${port}`);
});
