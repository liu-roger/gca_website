const { db } = require('../_lib/firebase');

function readBody(req) {
  return new Promise(resolve => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
  });
}

async function sendEmail({ to, subject, html, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping email');
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'GCA Team <onboarding@resend.dev>',
        to: [to],
        reply_to: replyTo || undefined,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('Resend error:', res.status, err);
    }
  } catch (e) {
    console.error('Failed to send email:', e.message);
  }
}

function buildEmailHtml(firstName, bodyHtml) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#1a1a1a;">
      <div style="border-bottom:2px solid #e5e7eb;padding-bottom:16px;margin-bottom:24px;">
        <h2 style="margin:0;font-size:20px;color:#111;">Global Communication Association</h2>
      </div>
      <p style="font-size:16px;">Hi ${firstName},</p>
      ${bodyHtml}
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:13px;color:#6b7280;">
        Global Communication Association
      </div>
    </div>
  `;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (!db) {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: 'Database not configured. Set FIREBASE_SERVICE_ACCOUNT in environment variables.' }));
  }

  const id = req.query.id;
  if (!id) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: 'Invalid id' }));
  }

  // PATCH /api/applications/:id
  if (req.method === 'PATCH') {
    const update = await readBody(req);
    const docRef = db.collection('applications').doc(String(id));
    const doc = await docRef.get();
    if (!doc.exists) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'Not found' }));
    }

    const existing = doc.data();
    const changes = {};
    if (update.status)        changes.status        = String(update.status).trim();
    if (update.interviewDate) changes.interviewDate = String(update.interviewDate).trim();
    await docRef.update(changes);

    const updated = { ...existing, ...changes };

    // Send email based on new status
    const adminEmail = update.adminEmail || null;
    const newStatus  = changes.status;

    if (newStatus === 'Accepted') {
      await sendEmail({
        to:      existing.email,
        replyTo: adminEmail,
        subject: 'Your GCA Application — Congratulations!',
        html: buildEmailHtml(existing.firstName, `
          <p style="font-size:16px;line-height:1.6;">
            We are pleased to inform you that your application to the
            <strong>Global Communication Association</strong> has been
            <strong style="color:#16a34a;">accepted</strong>.
          </p>
          <p style="font-size:16px;line-height:1.6;">
            Welcome to the team! We will be in touch shortly with next steps.
          </p>
          ${adminEmail ? `<p style="font-size:14px;color:#6b7280;">You can reply to this email if you have any questions.</p>` : ''}
        `),
      });
    }

    if (newStatus === 'Rejected') {
      await sendEmail({
        to:      existing.email,
        replyTo: adminEmail,
        subject: 'Your GCA Application — Update',
        html: buildEmailHtml(existing.firstName, `
          <p style="font-size:16px;line-height:1.6;">
            Thank you for your interest in the
            <strong>Global Communication Association</strong> and for taking the time to apply.
          </p>
          <p style="font-size:16px;line-height:1.6;">
            After careful consideration, we are unable to move forward with your application
            at this time. We appreciate your effort and encourage you to apply again in the future.
          </p>
          ${adminEmail ? `<p style="font-size:14px;color:#6b7280;">You can reply to this email if you have any questions.</p>` : ''}
        `),
      });
    }

    if (newStatus === 'Interview Scheduled') {
      const dateDisplay = changes.interviewDate || existing.interviewDate || 'a time to be confirmed';
      await sendEmail({
        to:      existing.email,
        replyTo: adminEmail,
        subject: 'Your GCA Interview Has Been Scheduled',
        html: buildEmailHtml(existing.firstName, `
          <p style="font-size:16px;line-height:1.6;">
            Great news — we would like to schedule an interview with you as part of
            the <strong>Global Communication Association</strong> application process.
          </p>
          <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px 20px;margin:20px 0;">
            <p style="margin:0;font-size:15px;font-weight:600;color:#0369a1;">
              Scheduled Interview Time
            </p>
            <p style="margin:6px 0 0;font-size:18px;font-weight:700;color:#0c4a6e;">
              ${dateDisplay}
            </p>
          </div>
          <p style="font-size:16px;line-height:1.6;">
            If this time does not work for you or you have any questions,
            please reply to this email and we will find an alternative.
          </p>
        `),
      });
    }

    return res.end(JSON.stringify(updated));
  }

  res.statusCode = 405;
  return res.end(JSON.stringify({ error: 'Method not allowed' }));
};
