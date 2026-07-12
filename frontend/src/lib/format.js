export const formatNumber = (value) => new Intl.NumberFormat('he-IL').format(Number(value) || 0);

export const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat('he-IL', {
    timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(new Date(value))
  : '—';
