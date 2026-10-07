package app.estudos.compartilhar

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import java.io.File

/**
 * Recebe as imagens do "Compartilhar", copia para `compartilhados/` na pasta
 * de dados do app — a mesma que o Tauri devolve como `app_data_dir` — e abre o
 * Estudos. Copiar na hora é obrigatório: a permissão de ler a `content://`
 * vale só enquanto esta tela vive.
 */
class CompartilharActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            copiar(uris(intent))
        } catch (e: Exception) {
            android.util.Log.e("Compartilhar", "falhou ao copiar", e)
        }
        packageManager.getLaunchIntentForPackage(packageName)?.let {
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            startActivity(it)
        }
        finish()
    }

    @Suppress("DEPRECATION")
    private fun uris(intent: Intent): List<Uri> = when (intent.action) {
        Intent.ACTION_SEND -> listOfNotNull(
            if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
            else intent.getParcelableExtra(Intent.EXTRA_STREAM)
        )
        Intent.ACTION_SEND_MULTIPLE ->
            (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
             else intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)) ?: emptyList()
        else -> emptyList()
    }

    private fun copiar(lista: List<Uri>) {
        val destino = File(dataDir, "compartilhados").apply { mkdirs() }
        val base = System.currentTimeMillis()
        lista.forEachIndexed { i, uri ->
            // `.parcial` até terminar: o app nunca lê um arquivo pela metade.
            val parcial = File(destino, "$base-$i.parcial")
            contentResolver.openInputStream(uri)?.use { entrada ->
                parcial.outputStream().use { entrada.copyTo(it) }
            } ?: return@forEachIndexed
            parcial.renameTo(File(destino, "$base-$i.img"))
        }
    }
}
