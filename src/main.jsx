import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AuthScreen from "./AuthScreen.jsx";
import { supabase } from "./supabase.js";

const C_bg = "#07090d";
const C_accent = "#c6f000";
const C_muted = "#52606e";

function Root() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);

  useEffect(() => {
    // Check if user already has a session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Check if user previously chose offline mode
    try {
      if (localStorage.getItem("periodizapro_offline_mode") === "true") {
        setOfflineMode(true);
      }
    } catch (e) { /* ignore */ }

    return () => subscription?.unsubscribe();
  }, []);

  const handleAuth = (user) => {
    if (user === null) {
      // Offline mode chosen
      setOfflineMode(true);
      try { localStorage.setItem("periodizapro_offline_mode", "true"); } catch (e) { /* ignore */ }
    }
    // If user logged in, setSession will fire via onAuthStateChange
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) { /* ignore */ }
    setSession(null);
    setOfflineMode(false);
    try { localStorage.removeItem("periodizapro_offline_mode"); } catch (e) { /* ignore */ }
  };

  const exitOfflineMode = () => {
    setOfflineMode(false);
    try { localStorage.removeItem("periodizapro_offline_mode"); } catch (e) { /* ignore */ }
  };

  if (loading) {
    return (
      <div style={{minHeight:"100vh",background:C_bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui"}}>
        <div style={{textAlign:"center"}}>
          <div style={{width:48,height:48,background:C_accent,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}>
            <span style={{fontSize:18,fontWeight:900,color:C_bg,letterSpacing:-1}}>PP</span>
          </div>
          <div style={{color:C_muted,fontSize:12,letterSpacing:1}}>Carregando...</div>
        </div>
      </div>
    );
  }

  // Not authenticated and not offline mode → show auth screen
  if (!session && !offlineMode) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  // Authenticated OR offline mode → show app
  return <App session={session} offlineMode={offlineMode} onLogout={handleLogout} onExitOffline={exitOfflineMode} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
