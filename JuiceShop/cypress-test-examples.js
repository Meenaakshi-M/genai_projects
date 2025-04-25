// Login Functionality Test
describe('Login Functionality', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.get('#navbarAccount').click();
    cy.get('#navbarLoginButton').click();
  });

  it('should display error message with invalid credentials', () => {
    cy.get('#email').type('invalid@example.com');
    cy.get('#password').type('invalidPassword');
    cy.get('#loginButton').click();
    cy.get('.error').should('be.visible')
      .and('contain', 'Invalid email or password');
  });
  
  it('should login successfully with valid credentials', () => {
    // Assuming there's a standard account available for testing
    cy.get('#email').type('user@juice-sh.op');
    cy.get('#password').type('password123');
    cy.get('#loginButton').click();
    cy.get('#navbarAccount').should('contain', 'account_circle');
    cy.get('.mat-menu-content').should('be.visible');
  });
});

// Product Search and Filtering Tests
describe('Product Search Functionality', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.get('.close-dialog').click(); // Close welcome banner if it appears
  });

  it('should search for products correctly', () => {
    cy.get('#searchQuery').type('Apple{enter}');
    cy.get('.product').should('contain', 'Apple');
  });
  
  it('should filter products by category', () => {
    cy.get('mat-select[aria-label="Category Selection"]').click();
    cy.get('mat-option').contains('Juice').click();
    cy.get('.product').should('exist');
    cy.get('.product').each((item) => {
      cy.wrap(item).find('.category').should('contain', 'Juice');
    });
  });
});

// Security Testing - XSS Vulnerability Test
describe('XSS Vulnerability Testing', () => {
  it('should test XSS vulnerability in search field', () => {
    cy.visit('/');
    cy.get('#searchQuery').type('<script>alert("XSS")</script>{enter}');
    // Verify the script tag is properly sanitized
    cy.get('body').should('not.contain', '<script>alert("XSS")</script>');
  });
});

// Shopping Cart Functionality
describe('Shopping Cart Functionality', () => {
  beforeEach(() => {
    cy.visit('/');
    cy.get('.close-dialog').click(); // Close welcome banner if it appears
  });
  
  it('should add product to cart', () => {
    cy.get('.mat-grid-tile')
      .first()
      .find('button[aria-label="Add to Basket"]')
      .click();
    
    cy.get('.mat-icon').contains('shopping_cart').click();
    cy.get('mat-table').should('be.visible');
    cy.get('mat-row').should('have.length.at.least', 1);
  });
  
  it('should update quantity in cart', () => {
    // Add product to cart first
    cy.get('.mat-grid-tile')
      .first()
      .find('button[aria-label="Add to Basket"]')
      .click();
    
    cy.get('.mat-icon').contains('shopping_cart').click();
    
    // Increase quantity
    cy.get('mat-row .mat-icon').contains('add').click();
    
    // Check that quantity increased
    cy.get('mat-cell').contains('2').should('exist');
  });
});

// API Testing
describe('API Testing', () => {
  it('should test product API', () => {
    cy.request('GET', '/api/Products')
      .then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.data).to.have.length.greaterThan(0);
      });
  });
  
  it('should test authentication API', () => {
    cy.request({
      method: 'POST',
      url: '/api/Users/login',
      body: {
        email: 'user@juice-sh.op',
        password: 'password123'
      }
    }).then((response) => {
      expect(response.status).to.eq(200);
      expect(response.body).to.have.property('token');
    });
  });
});

// SQL Injection Vulnerability Testing
describe('SQL Injection Testing', () => {
  it('should test basic SQL injection in login form', () => {
    cy.visit('/');
    cy.get('#navbarAccount').click();
    cy.get('#navbarLoginButton').click();
    
    // Try simple SQL injection
    cy.get('#email').type("' OR 1=1--");
    cy.get('#password').type('anything');
    cy.get('#loginButton').click();
    
    // If the application is properly secured, login should fail
    cy.get('.error').should('be.visible');
  });
});

// Checkout Process Tests
describe('Checkout Process', () => {
  beforeEach(() => {
    // Login and add product to cart
    cy.visit('/');
    cy.get('#navbarAccount').click();
    cy.get('#navbarLoginButton').click();
    cy.get('#email').type('user@juice-sh.op');
    cy.get('#password').type('password123');
    cy.get('#loginButton').click();
    
    cy.visit('/');
    cy.get('.mat-grid-tile')
      .first()
      .find('button[aria-label="Add to Basket"]')
      .click();
  });
  
  it('should complete checkout process', () => {
    cy.get('.mat-icon').contains('shopping_cart').click();
    cy.get('#checkoutButton').click();
    
    // Select delivery address
    cy.get('mat-radio-button').first().click();
    cy.get('#mat-button-next').click();
    
    // Select delivery speed
    cy.get('mat-radio-button').first().click();
    cy.get('#mat-button-next').click();
    
    // Enter payment details
    cy.get('#mat-input-card').type('4111111111111111');
    cy.get('#mat-input-month').type('12');
    cy.get('#mat-input-year').type('2025');
    cy.get('#mat-button-next').click();
    
    // Place order
    cy.get('#checkoutButton').click();
    
    // Verify order confirmation
    cy.get('.confirmation').should('contain', 'Thank you for your purchase');
  });
});
