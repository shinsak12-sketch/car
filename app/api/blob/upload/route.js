import { handleUpload } from '@vercel/blob/client';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 브라우저에서 Vercel Blob 으로 직접 업로드하기 위한 토큰 발급 엔드포인트.
// (서버 액션 본문 크기 제한을 우회 → 휴대폰 사진/동영상도 문제없이 업로드)
export async function POST(request) {
  const body = await request.json();
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const user = await getSession();
        if (!user) throw new Error('로그인이 필요합니다.');
        return {
          allowedContentTypes: [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
            'video/mp4', 'video/quicktime', 'video/webm',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/haansofthwp', 'application/x-hwp',
            'application/octet-stream',
          ],
          maximumSizeInBytes: 50 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    return Response.json(json);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
