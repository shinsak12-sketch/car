'use client';

// form 안에서 제출 전 확인창을 띄우는 버튼 (서버 액션 form 과 함께 사용).
// formAction 을 주면 부모 form 의 action 대신 이 버튼으로 제출 대상 지정 가능.
export default function ConfirmButton({ message = '진행할까요?', className = 'mini del', formAction, children }) {
  return (
    <button
      className={className}
      formAction={formAction}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
