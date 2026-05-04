import { useState } from "react";
import { supabase } from "./supabase";

const C = {
  bg:"#07090d", surface:"#0c1018", card:"#121820", border:"#1a2438",
  accent:"#c6f000", red:"#ff3f3f", green:"#19db7e", blue:"#3b9cff",
  text:"#d4dcef", muted:"#52606e",
};

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);
    if (!email || !password) {
      setError("Preencha email e senha.");
      return;
    }
    if (password.length < 6) {
      setError("Senha deve ter no mínimo 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data?.user) onAuth(data.user);
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data?.user && data?.session) {
          onAuth(data.user);
        } else {
          setInfo("Conta criada! Verifique seu email para confirmar (se configurado).");
          setMode("login");
        }
      }
    } catch (e) {
      setError(e?.message || "Erro ao autenticar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleOfflineMode = () => {
    // Use app without login - local only
    onAuth(null);
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Barlow Condensed','Barlow','Segoe UI',sans-serif"}}>
      <div style={{width:"100%",maxWidth:380,background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:24}}>
        {/* Logo */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:24}}>
          <div style={{width:58,height:58,background:C.accent,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:10}}>
            <span style={{fontSize:22,fontWeight:900,color:C.bg,letterSpacing:-1}}>PP</span>
          </div>
          <div style={{fontSize:17,fontWeight:900,color:C.accent,letterSpacing:3}}>PERIODIZA PRO</div>
          <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,marginTop:3}}>PERIODIZAÇÃO CIENTÍFICA</div>
        </div>

        {/* Tabs Login / Cadastro */}
        <div style={{display:"flex",background:C.bg,borderRadius:8,padding:3,marginBottom:18}}>
          {[{id:"login",l:"Entrar"},{id:"signup",l:"Criar Conta"}].map(t => (
            <button key={t.id} onClick={() => {setMode(t.id); setError(null); setInfo(null);}}
              style={{flex:1,border:"none",background:mode===t.id?C.accent:"transparent",color:mode===t.id?C.bg:C.muted,borderRadius:6,padding:"9px 4px",fontSize:12,fontWeight:700,cursor:"pointer",transition:"all .15s"}}>
              {t.l}
            </button>
          ))}
        </div>

        {/* Email */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:4,fontWeight:700}}>EMAIL</div>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="seu@email.com" autoComplete="email"
            style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"10px 12px",fontSize:14,boxSizing:"border-box"}}/>
        </div>

        {/* Password */}
        <div style={{marginBottom:15}}>
          <div style={{fontSize:9,color:C.muted,letterSpacing:1,marginBottom:4,fontWeight:700}}>SENHA</div>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="mínimo 6 caracteres"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,color:C.text,borderRadius:8,padding:"10px 12px",fontSize:14,boxSizing:"border-box"}}/>
        </div>

        {/* Messages */}
        {error && (
          <div style={{background:C.red+"22",border:`1px solid ${C.red}55`,color:C.red,padding:"8px 11px",borderRadius:7,fontSize:11,marginBottom:12,fontWeight:600}}>
            ⚠️ {error}
          </div>
        )}
        {info && (
          <div style={{background:C.green+"22",border:`1px solid ${C.green}55`,color:C.green,padding:"8px 11px",borderRadius:7,fontSize:11,marginBottom:12,fontWeight:600}}>
            ✅ {info}
          </div>
        )}

        {/* Main action button */}
        <button onClick={handleSubmit} disabled={loading}
          style={{width:"100%",background:C.accent,color:C.bg,border:"none",borderRadius:8,padding:"12px",fontSize:14,fontWeight:900,cursor:loading?"wait":"pointer",marginBottom:12,opacity:loading?.6:1,letterSpacing:1}}>
          {loading ? "Aguarde..." : mode === "login" ? "🔓 Entrar" : "✨ Criar Conta"}
        </button>

        {/* Offline mode */}
        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12,marginTop:4}}>
          <button onClick={handleOfflineMode}
            style={{width:"100%",background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px",fontSize:11,cursor:"pointer",fontWeight:600}}>
            📴 Usar sem conta (apenas neste aparelho)
          </button>
          <div style={{fontSize:9,color:C.muted,textAlign:"center",marginTop:7,lineHeight:1.4}}>
            Sem conta: dados ficam só aqui, sem sincronizar entre aparelhos.
          </div>
        </div>

        {/* Info */}
        <div style={{marginTop:16,padding:10,background:C.bg,borderRadius:7,fontSize:10,color:C.muted,lineHeight:1.5}}>
          <div style={{color:C.accent,fontWeight:700,marginBottom:3}}>💡 Com conta você pode:</div>
          • Sincronizar entre iPhone, iPad e MacBook<br/>
          • Acessar seus dados em qualquer navegador<br/>
          • Trocar de aparelho sem perder nada<br/>
          • Usar offline — sincroniza ao voltar online
        </div>
      </div>
    </div>
  );
}
