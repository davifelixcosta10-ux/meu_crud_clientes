import { test, expect } from '@playwright/test';

test.describe('WhatsApp Configuration', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard - IS_LOCAL mode will use demo data
    await page.goto('/dashboard.html');
    
    // Wait for the app to initialize
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000); // Allow JS to initialize
  });

  test('should navigate to Configurações → Geral and see WhatsApp section', async ({ page }) => {
    // Click on Configurações in sidebar
    await page.click('[data-secao="config"]');
    
    // Wait for config section to be visible
    await expect(page.locator('#config-geral')).toBeVisible({ timeout: 5000 });
    
    // Click on Geral tab
    await page.click('#tab-config-geral');
    
    // Wait for WhatsApp config section
    await expect(page.locator('#config-whatsapp')).toBeVisible();
    
    // Verify all WhatsApp config fields are present
    await expect(page.locator('#config-whatsapp-provedor')).toBeVisible();
    await expect(page.locator('#config-whatsapp-base-url')).toBeVisible();
    await expect(page.locator('#config-whatsapp-instancia')).toBeVisible();
    await expect(page.locator('#config-whatsapp-token')).toBeVisible();
    await expect(page.locator('#config-whatsapp-teste-telefone')).toBeVisible();
    await expect(page.locator('#config-whatsapp-teste-mensagem')).toBeVisible();
    await expect(page.locator('button:has-text("Salvar Configuração")')).toBeVisible();
  });

  test('should toggle between Evolution and Meta provider fields', async ({ page }) => {
    await page.goto('/dashboard.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await page.click('[data-secao="config"]');
    await page.click('#tab-config-geral');
    await expect(page.locator('#config-whatsapp')).toBeVisible();
    
    // Default should be Evolution
    const providerSelect = page.locator('#config-whatsapp-provedor');
    await expect(providerSelect).toHaveValue('evolution');
    
    // Evolution fields visible, Meta fields hidden
    await expect(page.locator('#config-whatsapp-evolution-fields')).toBeVisible();
    await expect(page.locator('#config-whatsapp-meta-fields')).toBeHidden();
    
    // Switch to Meta
    await providerSelect.selectOption('meta');
    await page.waitForTimeout(300);
    
    // Meta fields visible, Evolution fields hidden
    await expect(page.locator('#config-whatsapp-meta-fields')).toBeVisible();
    await expect(page.locator('#config-whatsapp-evolution-fields')).toBeHidden();
    
    // Switch back to Evolution
    await providerSelect.selectOption('evolution');
    await page.waitForTimeout(300);
    
    await expect(page.locator('#config-whatsapp-evolution-fields')).toBeVisible();
    await expect(page.locator('#config-whatsapp-meta-fields')).toBeHidden();
  });

  test('should fill and save WhatsApp configuration', async ({ page }) => {
    await page.goto('/dashboard.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await page.click('[data-secao="config"]');
    await page.click('#tab-config-geral');
    await expect(page.locator('#config-whatsapp')).toBeVisible();
    
    // Fill Evolution config
    await page.fill('#config-whatsapp-base-url', 'https://evolution.example.com');
    await page.fill('#config-whatsapp-instancia', 'test-instance');
    await page.fill('#config-whatsapp-token', 'test-token-123');
    await page.fill('#config-whatsapp-teste-telefone', '5511999999999');
    await page.fill('#config-whatsapp-teste-mensagem', 'Teste do Playwright');
    
    // Click save - this will call the API endpoint
    // Since we don't have a real backend for this test, we just verify the UI interaction
    await page.click('button:has-text("Salvar Configuração")');
    
    // Verify no JS errors occurred
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForTimeout(1000);
    
    // If we get here without JS errors, the UI interaction worked
    expect(errors.length).toBe(0);
  });

  test('should show WhatsApp config in localStorage after save', async ({ page }) => {
    await page.goto('/dashboard.html');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    await page.click('[data-secao="config"]');
    await page.click('#tab-config-geral');
    await expect(page.locator('#config-whatsapp')).toBeVisible();
    
    // Fill config
    await page.fill('#config-whatsapp-base-url', 'https://evolution.example.com');
    await page.fill('#config-whatsapp-instancia', 'test-instance');
    await page.fill('#config-whatsapp-token', 'test-token-123');
    
    // Save
    await page.click('button:has-text("Salvar Configuração")');
    await page.waitForTimeout(500);
    
    // Check localStorage was updated
    const whatsappConfig = await page.evaluate(() => {
      const config = localStorage.getItem('whatsapp_config');
      return config ? JSON.parse(config) : null;
    });
    
    expect(whatsappConfig).toBeTruthy();
    expect(whatsappConfig.provider).toBe('evolution');
    expect(whatsappConfig.base_url).toBe('https://evolution.example.com');
    expect(whatsappConfig.instance).toBe('test-instance');
    expect(whatsappConfig.token).toBe('test-token-123');
  });
});

test.describe('WhatsApp API Integration (requires backend)', () => {
  test('should test connection via API', async ({ page }) => {
    // This test would require a running backend with valid WhatsApp config
    // Skipped for now - would need test environment setup
    test.skip();
  });

  test('should send test message via API', async ({ page }) => {
    test.skip();
  });
});