let contadorBox = 1;

export function gerarBoxAleatoria() {
  return `${contadorBox++}`;
}

export function setContadorBox(valor) {
  contadorBox = valor;
}
