# 분쟁 대응 관리 프로그램

회사 앞 집회·분쟁 상황을 **여러 사람이 함께 기록하고 공유·대응**하기 위한 협업 웹 앱입니다.
단톡방과 달리 모든 기록이 남고, 링크만 알면 어디서든(PC·모바일) 같은 화면을 봅니다.

**스택**: Next.js (App Router) · Neon(서버리스 Postgres) · Vercel Blob(파일 저장) · Vercel 배포

## 주요 기능

| 기능 | 설명 |
|------|------|
| 🛡️ **대응 상황판** | 최근 상황·처리할 업무·통계를 한눈에 |
| 📋 **상황 일지 (타임라인)** | 집회/소음/충돌 등 사건을 시간순으로 기록, 사진·파일 첨부, 작성자 자동 기록 |
| ✅ **대응 업무 (칸반)** | 담당자·기한·우선순위로 할일 관리 (할일 → 진행 → 완료) |
| 📇 **연락처 · 관계자** | 경찰·구청·변호사·사내·상대측 연락처를 분류별로 정리 |
| 🗂️ **증거 · 자료함** | 사진·동영상·공문 업로드/보관 (Vercel Blob) |
| 🚨 **비상 알림** | 지정 대상에게 문자(SMS) 일괄 발송 + 발송 이력 기록 |
| 👤 **간단 로그인 / 사용자 관리** | 아이디·비밀번호 로그인(JWT 쿠키), 관리자/일반 권한 |

## Vercel 배포 (권장)

### 1. Neon 데이터베이스 만들기
1. [neon.tech](https://neon.tech) 가입 → 프로젝트 생성
2. 대시보드에서 **연결 문자열(Connection string)** 복사
   (`postgresql://...@ep-xxx.aws.neon.tech/neondb?sslmode=require`)

### 2. Vercel에 배포
1. 이 저장소를 GitHub에 올리고 [vercel.com](https://vercel.com) 에서 **Import**
2. **Settings → Environment Variables** 에 아래를 입력:
   | 변수 | 값 |
   |------|-----|
   | `DATABASE_URL` | Neon 연결 문자열 |
   | `SESSION_SECRET` | 긴 무작위 문자열 (아래 명령으로 생성) |
   | `SETUP_TOKEN` | 초기화용 임의 토큰 |
   | `NEXT_PUBLIC_ORG_NAME` | 조직/현장 이름 |

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. **Storage → Blob** 스토어를 생성해 프로젝트에 연결
   → `BLOB_READ_WRITE_TOKEN` 이 자동으로 추가됩니다 (증거/파일 업로드용)
4. **Deploy**

### 3. 데이터베이스 초기화 (최초 1회)
배포된 주소로 아래를 한 번 호출하면 테이블 생성 + 기본 관리자(admin/1234)가 만들어집니다:

```
https://<배포주소>/api/setup?token=<SETUP_TOKEN>
```

그다음 `admin` / `1234` 로 로그인 → **우측 상단 이름 → 내 계정**에서 비밀번호를 꼭 변경하세요.

## 로컬 개발

```bash
npm install
cp .env.example .env          # 값 채우기 (DATABASE_URL 등)
npm run setup                 # 스키마 생성 + 관리자(admin/1234)
#   (Node 20.6+: node --env-file=.env scripts/setup.mjs)
npm run dev                   # http://localhost:3000
```

> 로컬에서도 데이터는 Neon에 저장됩니다. Blob 토큰(`BLOB_READ_WRITE_TOKEN`)이
> 없으면 파일 업로드만 비활성화되고 나머지 기능은 정상 동작합니다.

## 비상 알림(문자/카톡) 실제 발송

기본값은 **기록 모드**입니다 — 실제 문자는 나가지 않고 "누구에게 무엇을 보냈는지" 기록만 남깁니다.
실제 SMS 발송을 켜려면 환경변수를 설정하세요:

```env
NOTIFY_PROVIDER=solapi
NOTIFY_SENDER=01012345678        # 사전 등록된 발신번호
SOLAPI_API_KEY=발급받은_키
SOLAPI_API_SECRET=발급받은_시크릿
```

- [Solapi(구 CoolSMS)](https://solapi.com) 연동을 기본 제공합니다.
- 카카오 알림톡·네이버 SENS·알리고 등은 `lib/notify.js` 에 어댑터를 추가하면 붙일 수 있습니다.
- 실제 문자 발송은 건당 요금이 발생합니다.

## 폴더 구조

```
app/                 페이지 (App Router) · api/ 라우트 핸들러
  page.js            대응 상황판(대시보드)
  login/  timeline/  tasks/  contacts/  files/  alerts/  users/  account/
  api/login  api/logout  api/setup
actions/             서버 액션 (생성·수정·삭제·알림 발송)
components/          Nav, 폼, 카드 등 UI 컴포넌트
lib/
  db.js              Neon 클라이언트 (sql 태그드 템플릿 / query)
  auth.js            JWT 쿠키 세션
  notify.js          비상 알림 발송 어댑터
  blob.js            Vercel Blob 업로드/삭제
  constants.js  format.js
db/schema.sql        Postgres 스키마
scripts/setup.mjs    로컬 초기화 스크립트
middleware.js        로그인 보호 (미인증 → /login)
```

## 참고 (보안)

- 로그인은 JWT(HttpOnly 쿠키)로 처리하며, 미인증 접근은 미들웨어가 `/login` 으로 돌립니다.
- Next.js는 최신 패치 버전(14.2.x)을 사용합니다. 남아 있는 일부 권고는 대부분
  이미지 최적화/특정 설정 관련으로 이 앱 사용 방식에는 해당하지 않으며 Vercel 플랫폼에서 완화됩니다.
