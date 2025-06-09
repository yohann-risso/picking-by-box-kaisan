import { supabase } from '../services/supabase.js';

export async function verificarRomaneioExiste(romaneio) {
  const { data, error } = await supabase
    .from('pedidos')
    .select('id')
    .eq('romaneio', romaneio);

  if (error || !data || data.length === 0) {
    return false;
  }
  return true;
}