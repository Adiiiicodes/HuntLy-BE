/**
 * Validates email format
 * @param {String} email - Email to validate
 * @returns {Boolean} Is email valid
 */
const isValidEmail = (email) => {
    const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
    return emailRegex.test(email);
  };
  
  /**
   * Validates password strength
   * @param {String} password - Password to validate
   * @returns {Object} Validation result
   */
  const validatePassword = (password) => {
    // At least 6 characters, 1 uppercase, 1 lowercase, 1 number
    const hasMinLength = password.length >= 6;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    
    const isValid = hasMinLength && hasUpperCase && hasLowerCase && hasNumber;
    
    return {
      isValid,
      message: isValid ? 'Password is valid' : 'Password must be at least 6 characters and include uppercase, lowercase, and a number'
    };
  };
  
  module.exports = {
    isValidEmail,
    validatePassword
  };