'use client';

import { useState } from 'react';

export default function ReportPrompt({ text }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한이 없을 때: textarea 선택 방식으로 폴백
      const ta = document.getElementById('report-prompt-text');
      if (ta) {
        ta.focus();
        ta.select();
        try {
          document.execCommand('copy');
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          alert('자동 복사에 실패했습니다. 아래 내용을 길게 눌러 직접 복사해 주세요.');
        }
      }
    }
  }

  return (
    <div className="report-prompt">
      <div className="report-actions">
        <button type="button" className="btn-primary" onClick={copy}>
          {copied ? '✓ 복사됨' : '📋 프롬프트 복사'}
        </button>
        <a href="https://claude.ai/new" target="_blank" rel="noreferrer" className="btn-sm">
          클로드 열기 ↗
        </a>
      </div>
      <p className="report-hint">
        <b>복사</b>를 누른 뒤 <b>클로드 열기</b>로 이동해 붙여넣기(길게 눌러 붙여넣기)하면
        위 기록을 바탕으로 보고서를 만들어 줍니다.
      </p>
      <textarea id="report-prompt-text" className="report-textarea" readOnly value={text} rows={18} onFocus={(e) => e.target.select()} />
    </div>
  );
}
