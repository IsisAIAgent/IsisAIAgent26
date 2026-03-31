// ============================================
// api/lib/validators.js — Validação de dados
// ============================================

export const validateLead = (data) => {
  const errors = [];

  if (!data.name || data.name.trim().length < 2) {
    errors.push({ field: 'name', message: 'Nome deve ter pelo menos 2 caracteres' });
  }

  if (!data.phone || !/^[\d\s\-\+\(\)]{10,}$/.test(data.phone)) {
    errors.push({ field: 'phone', message: 'Telefone inválido' });
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: {
      name: data.name?.trim(),
      phone: data.phone?.replace(/\D/g, ''),
      email: data.email?.toLowerCase().trim(),
      interesse: data.interesse?.trim()
    }
  };
};

export const validateCompany = (data) => {
  const errors = [];

  if (!data.companyName || data.companyName.trim().length < 3) {
    errors.push({ field: 'companyName', message: 'Nome inválido' });
  }

  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push({ field: 'email', message: 'Email inválido' });
  }

  if (!data.password || data.password.length < 6) {
    errors.push({ field: 'password', message: 'Mínimo 6 caracteres' });
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized: {
      companyName: data.companyName?.trim(),
      email: data.email?.toLowerCase().trim(),
      password: data.password,
      phone: data.phone?.replace(/\D/g, ''),
      industry: data.industry?.trim()
    }
  };
};
