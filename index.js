const API_URL = 'https://isis-ai-agent.vercel.app';

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('crm_token');
    if (token) { window.location.href = 'dashboard.html'; return; }

    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const msg = document.getElementById('msg');

    // Tabs
    document.getElementById('tab-login').addEventListener('click', () => {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        document.getElementById('tab-login').classList.add('active');
        document.getElementById('tab-register').classList.remove('active');
    });
    document.getElementById('tab-register').addEventListener('click', () => {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        document.getElementById('tab-register').classList.add('active');
        document.getElementById('tab-login').classList.remove('active');
    });

    function showMsg(text, type = 'error') {
        msg.textContent = text;
        msg.className = `message-box ${type}`;
        setTimeout(() => { msg.textContent = ''; msg.className = 'message-box'; }, 5000);
    }

    // LOGIN
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;       // ✅ corrigido
        const password = document.getElementById('loginPassword').value; // ✅ corrigido
        if (!email || !password) return showMsg('Email e senha são obrigatórios');

        const btn = document.getElementById('loginBtn');
        btn.textContent = 'Entrando...'; btn.disabled = true;
        try {
            const res = await fetch(API_URL + '/api/auth?action=login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Erro ao fazer login');
            localStorage.setItem('crm_token', data.token);
            localStorage.setItem('crm_company', JSON.stringify(data.company));
            window.location.href = 'dashboard.html';
        } catch (err) {
            showMsg(err.message || 'Erro ao conectar. Tente novamente.');
        } finally {
            btn.textContent = 'Entrar no Painel'; btn.disabled = false;
        }
    });

    // REGISTRO
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const companyName = document.getElementById('regCompany').value;
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;
        if (!companyName || !email || !password) return showMsg('Todos os campos são obrigatórios');

        const btn = document.getElementById('regBtn');
        btn.textContent = 'Criando...'; btn.disabled = true;
        try {
            const res = await fetch(API_URL + '/api/auth?action=register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyName, email, password })
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Erro ao registrar');
            showMsg('Conta criada! Faça login.', 'success');
            document.getElementById('tab-login').click();
        } catch (err) {
            showMsg(err.message || 'Erro ao registrar.');
        } finally {
            btn.textContent = 'Criar Conta Grátis'; btn.disabled = false;
        }
    });
});
