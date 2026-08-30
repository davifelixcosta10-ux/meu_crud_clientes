"""Helper Resend — envia invite/recovery sem depender do SMTP do Supabase."""
import os
import logging

logger = logging.getLogger(__name__)

def _get_resend_client():
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        return None
    try:
        import resend
        resend.api_key = api_key
        return resend
    except Exception as e:
        logger.warning(f"[resend] import falhou: {e}")
        return None

def _from_addr() -> str:
    return os.environ.get("RESEND_FROM") or "DaviFlow <onboarding@resend.dev>"

def enviar_email_resend(to: str, subject: str, html: str) -> bool:
    """Envia via Resend se RESEND_API_KEY estiver configurado. Retorna True se enviou."""
    client = _get_resend_client()
    if not client:
        return False
    try:
        params = {
            "from": _from_addr(),
            "to": to,
            "subject": subject,
            "html": html,
        }
        # resend 2.x: Emails.send
        if hasattr(client, "Emails") and hasattr(client.Emails, "send"):
            client.Emails.send(params)
        elif hasattr(client, "emails") and hasattr(client.emails, "send"):
            client.emails.send(params)
        else:
            import resend
            resend.Emails.send(params)
        logger.info(f"[resend] email enviado para {to} subject={subject}")
        return True
    except Exception as e:
        logger.warning(f"[resend] falha ao enviar para {to}: {e}")
        return False

def html_convite(org_nome: str, link: str, papel: str) -> str:
    return f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
      <div style="background:#4f46e5;padding:24px;text-align:center;color:#fff">
        <h1 style="margin:0;font-size:20px">Você foi convidado para <b>{org_nome}</b></h1>
        <p style="margin:8px 0 0;opacity:.9;font-size:13px">Papel: <b>{papel}</b></p>
      </div>
      <div style="padding:24px;color:#334155;line-height:1.6">
        <p>Olá!</p>
        <p>Você foi adicionado à organização <b>{org_nome}</b> no <b>DaviFlow</b>.</p>
        <p>Clique no botão abaixo para definir sua senha e acessar:</p>
        <p style="text-align:center;margin:24px 0">
          <a href="{link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700">Definir senha e acessar</a>
        </p>
        <p style="font-size:12px;color:#94a3b8">Link válido por 1h. Se expirar, use "Esqueci a senha" em https://daviflowgestoes.vercel.app</p>
        <p style="font-size:12px;color:#94a3b8">Se não esperava este convite, ignore.</p>
      </div>
    </div>
    """

def html_recovery(link: str) -> str:
    return f"""
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
      <div style="background:#0f172a;padding:24px;text-align:center;color:#fff">
        <h1 style="margin:0;font-size:20px">Redefina sua senha — DaviFlow</h1>
      </div>
      <div style="padding:24px;color:#334155;line-height:1.6">
        <p>Recebemos um pedido para redefinir sua senha.</p>
        <p style="text-align:center;margin:24px 0">
          <a href="{link}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700">Redefinir senha</a>
        </p>
        <p style="font-size:12px;color:#94a3b8">Link expira em 1h. Se não foi você, ignore.</p>
      </div>
    </div>
    """
