'use client';

// form 안에서 제출 전 확인창을 띄우는 버튼 (서버 액션 form 과 함께 사용)
export default function ConfirmButton({ message = '진행할까요?', className = 'mini del', children }) {
  return (
    <button
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
