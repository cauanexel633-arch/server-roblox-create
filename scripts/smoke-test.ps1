# Teste de fumaça do endpoint /pedidos em produção.
# Uso: .\scripts\smoke-test.ps1 -Token "SEU_GAME_SHARED_TOKEN"
param(
  [string]$Url = "https://interpreter-ai-parth.vercel.app/pedidos",
  [Parameter(Mandatory = $true)][string]$Token
)

function Enviar([string]$body, [string]$tok) {
  $headers = @{}
  if ($tok) { $headers["Authorization"] = "Bearer $tok" }
  try {
    $r = Invoke-WebRequest -Uri $Url -Method Post -Headers $headers -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body)) -UseBasicParsing
    return @{ status = [int]$r.StatusCode; body = $r.Content }
  } catch {
    $resp = $_.Exception.Response
    if (-not $resp) { return @{ status = 0; body = $_.Exception.Message } }
    $sr = New-Object IO.StreamReader($resp.GetResponseStream())
    return @{ status = [int]$resp.StatusCode; body = $sr.ReadToEnd() }
  }
}

$casos = @(
  @{ nome = "1. sem token (esperado 401)"; tok = ""; body = '{"jogador_id":1,"tipo":"arma","descricao":"pistola","inventario":{"metal":10}}' },
  @{ nome = "2. descricao vazia (esperado 400 texto_invalido)"; tok = $Token; body = '{"jogador_id":1,"tipo":"arma","descricao":"  ","inventario":{"metal":10}}' },
  @{ nome = "3. arma ok (esperado ok true)"; tok = $Token; body = '{"jogador_id":1,"tipo":"arma","descricao":"uma pistola com balas de metal","inventario":{"metal":10,"madeira":5,"polvora":4}}' },
  @{ nome = "4. arma sem material (esperado ok false materiais_insuficientes)"; tok = $Token; body = '{"jogador_id":2,"tipo":"arma","descricao":"um rifle","inventario":{"metal":0}}' },
  @{ nome = "5. mapa ok (esperado ok true)"; tok = $Token; body = '{"jogador_id":3,"tipo":"mapa","descricao":"uma arena pequena com um pilar no centro e um ponto de spawn","inventario":{"metal":10,"madeira":20}}' },
  @{ nome = "6. pedido impossivel (esperado ok false pedido_impossivel)"; tok = $Token; body = '{"jogador_id":4,"tipo":"arma","descricao":"um canhao nuclear de plasma orbital","inventario":{"metal":10}}' }
)

foreach ($c in $casos) {
  $r = Enviar $c.body $c.tok
  Write-Host ""
  Write-Host $c.nome -ForegroundColor Cyan
  Write-Host "HTTP $($r.status)"
  Write-Host $r.body
}
