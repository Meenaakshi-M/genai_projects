// cypress/integration/user-management.spec.js

describe('Juice Shop User Management', () => {
  const baseUrl = 'https://juice-shop.herokuapp.com';
  
  beforeEach(() => {
    cy.visit(baseUrl);
    
    // Close the welcome banner if it appears
    cy.get('body').then($body => {
      if ($body.find('button[aria-label="Close Welcome Banner"]').length > 0) {
        cy.get('button[aria-label="Close Welcome Banner"]').click();
      }
    });
    
    // Accept cookies if the dialog appears
    cy.get('body').then($body => {
      if ($body.find('button[aria-label="dismiss cookie message"]').length > 0) {
        cy.get('button[aria-label="dismiss cookie message"]').click();
      }
    });
  });

  /**
   * TC-UM-01: User Registration - Valid Data
   * 
   * Preconditions:
   * • Juice Shop application is accessible
   * • User does not have an existing account
   */
  it('TC-UM-01: Should register a new user with valid data', () => {
    // Generate a unique email to avoid conflicts with existing accounts
    const uniqueEmail = `test_user_${Date.now()}@example.com`;
    const password = 'Password123!';
    
    // Navigate to the Registration page
    cy.get('#navbarAccount').click();
    cy.get('#navbarLoginButton').click();
    cy.contains('Not yet a customer?').click();
    
    // Fill in the registration form
    cy.get('#emailControl').type(uniqueEmail);
    cy.get('#passwordControl').type(password);
    cy.get('#repeatPasswordControl').type(password);
    
    // Select security question
    cy.get('#mat-select-security-question').click();
    cy.get('mat-option').contains("Mother's maiden name").click();
    
    // Answer the security question
    cy.get('#securityAnswerControl').type('Smith');
    
    // Register
    cy.get('#registerButton').click();
    
    // Verify registration success
    cy.contains('Registration completed successfully').should('be.visible');
    
    // Verify can login with created credentials
    cy.get('#email').type(uniqueEmail);
    cy.get('#password').type(password);
    cy.get('#loginButton').click();
    
    // Verify successful login redirect
    cy.url().should('include', baseUrl + '/#/search');
    
    // Verify navigation menu shows logged-in state
    cy.get('#navbarAccount').click();
    cy.get('.mat-menu-content').should('be.visible');
    cy.get('.mat-menu-content').should('contain', 'My Basket');
  });

  /**
   * TC-UM-02: User Registration - Email Already Exists
   * 
   * Preconditions:
   * • Juice Shop application is accessible
   * • An account with email "admin@juice-sh.op" already exists (default account)
   */
  it('TC-UM-02: Should show error when registering with existing email', () => {
    const existingEmail = 'admin@juice-sh.op'; // Using default admin account
    const password = 'Password123!';
    
    // Navigate to the Registration page
    cy.get('#navbarAccount').click();
    cy.get('#navbarLoginButton').click();
    cy.contains('Not yet a customer?').click();
    
    // Fill in the registration form with existing email
    cy.get('#emailControl').type(existingEmail);
    cy.get('#passwordControl').type(password);
    cy.get('#repeatPasswordControl').type(password);
    
    // Select security question
    cy.get('#mat-select-security-question').click();
    cy.get('mat-option').contains("Mother's maiden name").click();
    
    // Answer the security question
    cy.get('#securityAnswerControl').type('Smith');
    
    // Register
    cy.get('#registerButton').click();
    
    // Verify error message
    cy.contains('Email must be unique').should('be.visible');
    
    // Verify user remains on registration page
    cy.url().should('include', 'register');
  });

  /**
   * TC-UM-03: User Login - Valid Credentials
   * 
   * Preconditions:
   * • Juice Shop application is accessible
   * • User has a registered account (using default demo account)
   */
  it('TC-UM-03: Should login with valid credentials', () => {
    // Using the default demo account
    const validEmail = 'demo@juice-sh.op';
    const validPassword = 'demo';
    
    // Navigate to the Login page
    cy.get('#navbarAccount').click();
    cy.get('#navbarLoginButton').click();
    
    // Enter valid credentials
    cy.get('#email').type(validEmail);
    cy.get('#password').type(validPassword);
    cy.get('#loginButton').click();
    
    // Verify successful login
    cy.url().should('include', baseUrl + '/#/search');
    
    // Verify navigation menu displays logged-in user options
    cy.get('#navbarAccount').click();
    cy.get('.mat-menu-content').should('be.visible');
    cy.get('.mat-menu-content').should('contain', 'My Basket');
  });

  /**
   * TC-UM-04: User Login - Invalid Credentials
   * 
   * Preconditions:
   * • Juice Shop application is accessible
   */
  it('TC-UM-04: Should show error with invalid login credentials', () => {
    const validEmail = 'demo@juice-sh.op';
    const invalidPassword = 'wrongpassword';
    
    // Navigate to the Login page
    cy.get('#navbarAccount').click();
    cy.get('#navbarLoginButton').click();
    
    // Enter invalid credentials
    cy.get('#email').type(validEmail);
    cy.get('#password').type(invalidPassword);
    cy.get('#loginButton').click();
    
    // Verify error message
    cy.contains('Invalid email or password').should('be.visible');
    
    // Verify user remains on login page
    cy.url().should('include', 'login');
  });

  /**
   * TC-UM-05: Password Reset
   * 
   * Preconditions:
   * • Juice Shop application is accessible
   * • User has a registered account with associated security question/answer
   */
  it('TC-UM-05: Should reset password when security answer is correct', () => {
    // First, register a new user to ensure we have the security question/answer
    const uniqueEmail = `reset_test_${Date.now()}@example.com`;
    const originalPassword = 'Password123!';
    const newPassword = 'NewPassword456!';
    const securityAnswer = 'Smith';
    
    // Register new user first
    cy.get('#navbarAccount').click();
    cy.get('#navbarLoginButton').click();
    cy.contains('Not yet a customer?').click();
    
    cy.get('#emailControl').type(uniqueEmail);
    cy.get('#passwordControl').type(originalPassword);
    cy.get('#repeatPasswordControl').type(originalPassword);
    
    cy.get('#mat-select-security-question').click();
    cy.get('mat-option').contains("Mother's maiden name").click();
    cy.get('#securityAnswerControl').type(securityAnswer);
    cy.get('#registerButton').click();
    
    // Wait for registration success and return to login
    cy.contains('Registration completed successfully').should('be.visible');
    
    // Start password reset process
    cy.contains('Forgot your password?').click();
    
    // Enter email
    cy.get('#email').type(uniqueEmail);
    cy.get('#securityAnswer').type(securityAnswer);
    cy.get('#newPassword').type(newPassword);
    cy.get('#newPasswordRepeat').type(newPassword);
    cy.get('#resetButton').click();
    
    // Verify password reset success
    cy.contains('Your password was successfully changed').should('be.visible');
    
    // Login with new password
    cy.get('#email').type(uniqueEmail);
    cy.get('#password').type(newPassword);
    cy.get('#loginButton').click();
    
    // Verify successful login with new password
    cy.url().should('include', baseUrl + '/#/search');
  });
});
