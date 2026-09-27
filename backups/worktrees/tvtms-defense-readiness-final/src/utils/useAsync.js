import { useCallback, useEffect, useState } from 'react';
export default function useAsync(loader, deps=[]) {
  const [data,setData]=useState(null); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const run=useCallback(async()=>{ setLoading(true); setError(''); try { const v=await loader(); setData(v); return v; } catch(e){ setError(e.message||'Request failed'); throw e; } finally { setLoading(false); } }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{ run().catch(()=>null); },[run]);
  return { data, loading, error, reload:run, setData };
}
