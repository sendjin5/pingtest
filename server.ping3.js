require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const iconv = require('iconv-lite');

const app = express();
const port = process.env.PORT || 8080;

// CORS 설정
app.use(cors());

// JSON 파싱 미들웨어
app.use(express.json());

// ✅ .env 파일에서 IP 목록 불러오기
const ipList = JSON.parse(process.env.IP_LIST || '[]');

/**
 * [기능] ping 출력(stdout)에서 응답 시간(ms)을 파싱합니다.
 *
 * [실행 순서]
 * 1) stdout 문자열에서 "time=" 또는 "시간=" 패턴을 정규식으로 검색
 * 2) 찾으면 "<숫자> ms" 형태로 반환
 * 3) 못 찾으면 null 반환
 */
function parsePingTimeMs(decodedOutput) {
  const match = decodedOutput.match(/(?:time=|시간=)([\d.]+)\s*ms/i);
  return match ? `${match[1]} ms` : null;
}

/**
 * [기능] OS에 맞게 ping을 "1회 전송 + 1초 대기"로 실행합니다.
 *
 * - Linux/Ubuntu: `ping -c 1 -W 1 <ip>`  (1회, 최대 1초 대기)
 * - Windows:     `ping -n 1 -w 1000 <ip>`(1회, 최대 1000ms 대기)
 *
 * [실행 순서]
 * 1) OS 판별 후 ping 커맨드 생성
 * 2) `exec()`로 실행(안전장치: timeout/maxBuffer)
 * 3) stdout(Buffer)을 OS별 인코딩으로 디코딩
 * 4) 성공/실패(status) 및 시간(time) 파싱 후 결과 반환
 */
function pingOnce({ label, ip }) {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? `ping -n 1 -w 1000 ${ip}` : `ping -c 1 -W 1 ${ip}`;

  return new Promise((resolve) => {
    exec(
      cmd,
      {
        encoding: 'buffer',
        timeout: 3000, // 예외 케이스에서 ping이 붙잡히지 않게 하는 안전장치(ms)
        maxBuffer: 1024 * 1024, // 출력 버퍼(1MB)
      },
      (error, stdout, stderr) => {
        // stdout 디코딩: Windows는 cp949(=euc-kr 계열)인 경우가 많고, Linux는 utf-8이 일반적
        const decodedOutput = iconv.decode(stdout, isWin ? 'cp949' : 'utf-8');
        const time = parsePingTimeMs(decodedOutput);

        // 성공 판단: 에러가 없고 시간 파싱이 되는 경우를 성공으로 간주
        const ok = !error && time !== null;
        const status = ok ? '응답 완료' : '응답 없음';

        console.log(
          `[진행중] ${label} (${ip}) → ${status}, ${time}, 응답:\n${decodedOutput}`
        );

        resolve({
          label,
          ip,
          status,
          time,
          stdout: decodedOutput,
          stderr: stderr ? String(stderr) : null,
        });
      }
    );
  });
}

/**
 * [기능] ping을 최대 3번 반복 수행하고, 성공 시 즉시 종료합니다.
 *
 * [실행 순서]
 * 1) attempt=1..3 루프
 * 2) 매 회 `pingOnce()` 실행 (1회 ping + 1초 대기)
 * 3) 성공(status==="응답 완료")이면 즉시 반환
 * 4) 3번 모두 실패하면 "응답 없음"으로 반환
 *
 * [반환]
 * - 기존 호환 필드: `label`, `ip`, `status`, `time`, `stdout`
 * - 추가 필드: `attemptResults` (각 시도 결과 배열)
 */
async function pingUpTo3Times({ label, ip }) {
  const attemptResults = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await pingOnce({ label, ip });
    attemptResults.push({ attempt, ...r });

    if (r.status === '응답 완료') {
      return {
        label,
        ip,
        status: '응답 완료',
        time: r.time,
        stdout: r.stdout,
        attemptResults,
      };
    }
  }

  const last = attemptResults[attemptResults.length - 1];
  return {
    label,
    ip,
    status: '응답 없음',
    time: null,
    stdout: last ? last.stdout : null,
    attemptResults,
  };
}

// IP 목록 반환 API
app.get('/ip-list', (req, res) => {
  res.json(ipList);
});

// 모든 IP에 ping 테스트 (IP당 1회 ping + 1초 대기 작업을 최대 3번 반복)
app.get('/ping-all', async (req, res) => {

  const pingPromises = ipList.map(({ label, ip }) => pingUpTo3Times({ label, ip }));
  const results = await Promise.all(pingPromises);
  res.json(results);
});

app.use(express.static(path.join(__dirname, '/')));

app.listen(port, () => {
  console.log(`서버 실행 중: http://localhost:${port}`);
});


