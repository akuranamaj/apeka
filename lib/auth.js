const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');

const COOKIE_NAME = 'w2a_token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days, seconds

async function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signSession(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: COOKIE_MAX_AGE });
}

function verifySession(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE * 1000,
    path: '/'
  };
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  const session = token && verifySession(token);
  if (!session) return res.status(401).json({ error: 'Belum login' });
  req.user = session;
  next();
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  cookieOptions,
  requireAuth
};
