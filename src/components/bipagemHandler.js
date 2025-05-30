import { supabase } from "../api/supabase.js";
import { gerarBoxAleatoria } from "../utils/box.js";

export async function biparProduto(skuOuEan, romaneio) {
  if (!skuOuEan || !romaneio) {
    return { status: "erro", msg: "SKU/EAN e romaneio obrigatórios" };
  }

  const { data: pedidos, error: erroPedidos } = await supabase
    .from("pedidos")
    .select("id, data")
    .eq("romaneio", romaneio)
    .order("data", { ascending: true });

  if (erroPedidos || !pedidos || pedidos.length === 0) {
    return { status: "erro", msg: "Romaneio não encontrado" };
  }

  const pedidoIds = pedidos.map((p) => p.id);

  const { data: produtos, error: erroProdutos } = await supabase
    .from("produtos_pedido")
    .select("*")
    .in("pedido_id", pedidoIds)
    .or(`sku.eq.${skuOuEan},ean.eq.${skuOuEan}`)
    .order("pedido_id", { ascending: true });

  if (erroProdutos || !produtos || produtos.length === 0) {
    return { status: "erro", msg: "Produto não encontrado no romaneio" };
  }

  const produtoElegivel = produtos.find((p) => p.qtd_bipada < p.qtd);

  if (!produtoElegivel) {
    return { status: "erro", msg: "Produto não encontrado ou já distribuído!" };
  }

  const pedidoId = produtoElegivel.pedido_id;

  const { data: produtosDoMesmoPedido } = await supabase
    .from("produtos_pedido")
    .select("box, qtd, qtd_bipada")
    .eq("pedido_id", pedidoId);

  const boxExistente = produtosDoMesmoPedido.find((p) => p.box)?.box;
  const box = boxExistente || gerarBoxAleatoria();
  const novaQtd = produtoElegivel.qtd_bipada + 1;

  const { error: erroUpdate } = await supabase
    .from("produtos_pedido")
    .update({ qtd_bipada: novaQtd, box })
    .eq("id", produtoElegivel.id);

  if (erroUpdate) {
    return { status: "erro", msg: "Erro ao registrar bipagem" };
  }

  const totalPedido = produtosDoMesmoPedido.reduce((s, p) => s + p.qtd, 0);
  const totalBipado = produtosDoMesmoPedido.reduce(
    (s, p) => s + (p.qtd_bipada || 0),
    0
  );

  return {
    status: "ok",
    msg: `✅ SKU ${produtoElegivel.sku} bipado! Pedido ${pedidoId} → Box ${box}`,
    id: produtoElegivel.id,
    pedido_id: pedidoId,
    box,
    sku: produtoElegivel.sku,
    endereco:   produtoElegivel.endereco,
    descricao: produtoElegivel.descricao || "-",
    qtd_bipada: totalBipado,
    total: totalPedido,
  };
}