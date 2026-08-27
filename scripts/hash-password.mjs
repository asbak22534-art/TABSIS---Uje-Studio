import bcrypt from 'bcryptjs';

const password = process.argv[2] || '';
if (password.length < 8) {
  console.error('Gunakan: npm run hash-password -- "PASSWORD_MINIMAL_8_KARAKTER"');
  process.exit(1);
}
console.log(bcrypt.hashSync(password, 12));
