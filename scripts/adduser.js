#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const bcrypt = require('bcryptjs');

const USERS_FILE = path.join(__dirname, '..', 'users.json');
const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Username: ', (username) => {
  if (!USERNAME_RE.test(username)) {
    console.error('Username may only contain letters, numbers, hyphens and underscores (it becomes the uploads/ subfolder name).');
    rl.close();
    process.exitCode = 1;
    return;
  }

  rl.question('Password: ', (password) => {
    if (!password) {
      console.error('Password cannot be empty.');
      rl.close();
      process.exitCode = 1;
      return;
    }

    rl.question('Make this user an admin? (y/N): ', (answer) => {
      const isAdmin = /^y(es)?$/i.test(answer.trim());
      const users = loadUsers();
      users[username] = { hash: bcrypt.hashSync(password, 10), isAdmin };
      saveUsers(users);
      console.log(`User "${username}" (${isAdmin ? 'admin' : 'regular'}) saved to ${USERS_FILE}`);
      rl.close();
    });
  });
});
