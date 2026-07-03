export default function Loading() {
  return (
    <div className="skeleton" aria-busy="true" aria-label="불러오는 중">
      <div className="sk-line" style={{ width: '40%', height: 22 }} />
      <div className="sk-card" />
      <div className="sk-card" />
      <div className="sk-line" style={{ width: '80%' }} />
      <div className="sk-line" style={{ width: '65%' }} />
    </div>
  );
}
