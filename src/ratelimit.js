// Limitador simples em memória: no máximo `max` tentativas por chave dentro da janela.
function createLimiter(max, windowMinutes) {
  const hits = new Map(); // chave -> [timestamps]
  return {
    // Retorna os minutos que faltam para liberar (0 = liberado) e registra a tentativa.
    hit(key) {
      const now = Date.now();
      const windowMs = windowMinutes * 60000;
      const list = (hits.get(key) || []).filter(t => now - t < windowMs);
      if (list.length >= max) {
        hits.set(key, list);
        return Math.ceil((windowMs - (now - list[0])) / 60000);
      }
      list.push(now);
      hits.set(key, list);
      return 0;
    },
    reset(key) { hits.delete(key); },
  };
}

module.exports = { createLimiter };
