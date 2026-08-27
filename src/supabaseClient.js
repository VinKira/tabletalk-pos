import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mjxkpyasxjnfgzttvuvy.supabase.co'
const supabaseAnonKey = 'sb_publishable_ha9xlTJ6_0CaBAQGoH_szA_X8IzSFdu'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
