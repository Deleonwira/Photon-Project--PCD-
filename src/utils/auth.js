/* PHOTON — Auth Utility */

import { API_BASE } from './api.js';

/**
 * Register a new user.
 */
export async function register(username, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  localStorage.setItem('photon_user', JSON.stringify(data.user));
  return data.user;
}

/**
 * Log in.
 */
export async function login(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  localStorage.setItem('photon_user', JSON.stringify(data.user));
  return data.user;
}

/**
 * Log out.
 */
export async function logout() {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  localStorage.removeItem('photon_user');
}

/**
 * Get current user from localStorage (fast) or verify with server.
 */
export function getUser() {
  const stored = localStorage.getItem('photon_user');
  return stored ? JSON.parse(stored) : null;
}

export function isLoggedIn() {
  return !!getUser();
}
