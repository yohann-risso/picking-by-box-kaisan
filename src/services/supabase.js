import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// também pode exportar a URL base das functions:
export const supabaseFunctionsUrl = supabaseUrl.replace(
  ".supabase.co",
  ".functions.supabase.co"
);
