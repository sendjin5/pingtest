require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const app = express();
const port = process.env.PORT || 8080;
const iconv = require('iconv-lite');

// CORS 설정
app.use(cors());

// JSON 파싱 미들웨어
app.use(express.json());


// ✅ .env 파일에서 IP 목록 불러오기
const ipList = JSON.parse(process.env.IP_LIST || '[]');

// ✅ IP 목록 반환 API
app.get('/api/ip-list', (req, res) => {
  res.json(ipList);
});

// ✅ 모든 IP에 ping 테스트
app.get('/ping-all', async (req, res) => {
  const pingPromises = ipList.map(({ label, ip }) => {
    return new Promise(resolve => {
        exec(`ping ${ip}`, { encoding: 'buffer' }, (error, stdout, stderr) => {
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
        console.log(`[진행중] ${label} (${ip}) → ${status}, ${time}, 응답:\n${decodedOutput}`);
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
