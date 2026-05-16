const request = require('supertest');
const { app, pool } = require('./index'); // Import your server and database

// This prevents Jest from timing out if Google's API is slow
jest.setTimeout(30000); 

describe('🤖 Draftly Full Automation Cycle', () => {
  let newDraftId;

  // STEP 1: Automate GET
  it('1. Should fetch email and generate AI draft', async () => {
    const response = await request(app).get('/sync-emails');
    
    // If it finds an email, save the ID for the next step
    if (response.body.data) {
        newDraftId = response.body.data.id;
        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Synced with Advanced AI Context!');
        console.log(`✅ AI Draft Generated! Database ID: ${newDraftId}`);
    } else {
        console.log('⚠️ No unread emails found to test. Send yourself an email first!');
    }
  });

  // STEP 2: Automate PUT
  it('2. Should approve the newly generated draft', async () => {
    if (!newDraftId) return; // Skip if step 1 failed
    
    const response = await request(app)
      .put(`/drafts/${newDraftId}`)
      .send({ status: 'Approved' });
      
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('Approved');
    console.log(`✅ Draft ${newDraftId} Approved!`);
  });

  // STEP 3: Automate POST
  it('3. Should send the approved draft via Gmail', async () => {
    if (!newDraftId) return; // Skip if step 1 failed
    
    const response = await request(app).post(`/drafts/${newDraftId}/send`);
    
    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Email sent successfully and thread maintained!');
    console.log(`✅ Draft ${newDraftId} Sent to Gmail! Thread maintained.`);
  });

  // CLEANUP: Close the database connection when finished
  afterAll(async () => {
    await pool.end();
  });
});