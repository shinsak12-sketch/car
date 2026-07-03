'use strict';

// 연락처 인라인 수정 폼 토글
function toggleEdit(id) {
  var el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
}

// reset-form 토글용 (users 페이지)
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.reset-form').forEach(function (f) {
    f.classList.remove('show');
  });
});
