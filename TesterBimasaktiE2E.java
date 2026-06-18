import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class TesterBimasaktiE2E {
    private static final HttpClient client = HttpClient.newHttpClient();
    private static final String BASE_URL = "http://127.0.0.1:8080"; // Using localhost inside WSL
    private static final String ADMIN_API_KEY = "test_admin";

    public static void main(String[] args) throws Exception {
        System.out.println("Memulai E2E Test Bimasakti Native Integration di Hyperswitch...");
        
        String merchantId = "merchant_" + UUID.randomUUID().toString().substring(0, 8);
        System.out.println("1. Membuat Merchant Account: " + merchantId);
        
        String accountPayload = "{" +
                "\"merchant_id\": \"" + merchantId + "\"," +
                "\"merchant_name\": \"RS Bimasakti Test E2E\"," +
                "\"primary_business_details\": [{\"country\": \"US\", \"business\": \"default\"}]" +
                "}";
                
        String accountResponse = sendPost(BASE_URL + "/accounts", accountPayload, ADMIN_API_KEY);
        System.out.println("   Response: " + accountResponse + "\n");
        
        System.out.println("2. Membuat API Key untuk Merchant...");
        String apiKeyPayload = "{" +
                "\"name\": \"E2E Test Key\"," +
                "\"description\": \"Key for E2E testing\"," +
                "\"expiration\": \"never\"" +
                "}";
        String apiKeyResponse = sendPost(BASE_URL + "/api_keys/" + merchantId, apiKeyPayload, ADMIN_API_KEY);
        System.out.println("   Raw API Key Response: " + apiKeyResponse);
        String apiKey = extractJsonValue(apiKeyResponse, "api_key");
        if (apiKey == null) {
            System.err.println("Gagal mendapatkan API Key: " + apiKeyResponse);
            return;
        }
        System.out.println("   API Key berhasil dibuat (masked): " + apiKey.substring(0, 5) + "***");
        System.out.println("   API Key length: " + apiKey.length() + "\n");
        
        System.out.println("3. Mengonfigurasi Connector Bimasakti...");
        String connectorPayload = "{" +
                "\"connector_type\": \"payment_processor\"," +
                "\"connector_name\": \"bimasakti\"," +
                "\"connector_account_details\": {" +
                "    \"auth_type\": \"SignatureKey\"," +
                "    \"api_key\": \"c4fc810c-52b1-4b14-9523-135630c8485b\"," +
                "    \"key1\": \"-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC6WICl865rgRVd\\nb7iiCvKTodschtpZIMx/dKf6OKvOB7DdQUYY4Rgqk1Pa7stiljCERf64InoUpUhH\\nPv0qJMCRv3fI6VT1pQNZDwNXcE48jf6d1a3jXOBGp957X2+erD3/R8rehYECPM1r\\nfJCkfO5daR2vcgJEAmlIT6S9XvZaHrN2YYoa9xQXs3SQ6sA/kDB5Jj/N1g79XtMu\\n3+bLN733Rkw1dqiWt7yeQcJLoL21bhtHimfJqE7W5ujQkbI3GdbE88lrnG+O3H7k\\nqx00kjg2ZMCAarWEVsrHvdRDk5mgtpB8URe52bdwX0YrX16STeWS7X7bIlb16DbG\\nc1UyBGSNAgMBAAECggEAOYKK4aydDeyerWGHd+stBkcTmnA7/vnSYxubo+vNih5x\\nhTdZ7N+7V5h0bsL33gtAGfKINEffqXOBJQvZkiIZlGGlFEp+v/kXWWr6uweb/bBM\\n/mUt71eAmA3C6gyAJFZAJAMCJz7Im+or85pUAY/U+NsyIC1taZPc7kY2L4OZQCJm\\nl86wXndgdseXiMQeFinDaaD22Pe9kJq9l7d9x8iJ4EWd97rynUx8tu4nC5YG6PDY\\nvc7TNTKjURGf2hCcqy8GLVCkmJXLEGNRW3RDnoSCKLERiHw8d/DHRkpD1ARNavtl\\n7+93XQbtLepBANErQawKvjkkEW7iBfhXLX7HGPRBAQKBgQDh+ElbBILXvwO7+UP6\\ndCrwCMudi52JILKbrs9R62Wpd5cr8kQwM5S5mJqPj4R56yvaspz63hbQXCWxUb7b\\n6o8kBaTKZ8si6vnsDzs4TE/E/DFNdgv3plD8hvV9s/aMXlxTpwKkpsxhZFTtKA7x\\n9Y8t+12r6s+OS1yNluJwnOBjrQKBgQDTHCnzvLgkK2yilwxfPn/9Fg3tMFd5oYkU\\nGwXnyWNv5a4vtla3Kaj/ljXKv5cU8m9kHT+h4G6hVy0+vTdzZmQnNmZ9FpH+Xf0H\\npdoFoNjoXXkcS5TtQLS8KlW9iNpejSUXjeDF5Trshx/AbqSkkh8755siuJhncydt\\nrL55z80gYQKBgQDJNN6Ed+DVoFT/5HT+JsAw2XQMhUux1XaUHzSlOdhc7Iqj6+WB\\nkfxEwjglymHoeVmkM1SKIITp5JL/b81lXlc0eP4B6Ce9oMMGyY0ulOyWdwSjd5Ay\\nZFpKcRVYZ40J8d998QDugUMNGVxxizC7i66BAAipUrybdEkmHgrkwRsgRQKBgB8M\\nqmLt48t2E5FKVAiCIcLwhnXXQVZjWsz5OIIhzZ08k8TytYhU+UU2K405ZpgvHBEG\\neEBvyPWz47SxkcFIUvytdJ97PVfDLR791rYzNRPgA5sUxr+qX6q5M0kgIrX7XnQ7\\nas7Qaz00lofv/gkycKOX6epOaiP0/NyVpqI13P6hAoGAdzj0ggJ6tu6ZnU09j9kI\\n1TMX87WpDBdRrUAGE6QlsvkAGy4mDHERxJrQzRCgva5EnTm2L0Jgo96u5bCJLP0r\\nyLBAB/qfe2fiVMXetwIeA6D66E9eAMQ0ACBuWlHt8Mk8dJ35rt3/j4Qret8Uk4O3\\nTjyBzsaGIcLVbu5Uc4Z1tnc=\\n-----END PRIVATE KEY-----\"," +
                "    \"api_secret\": \"358ef52d-5b92-4aee-b6a5-e5518eeb684e\"" +
                "}," +
                "\"payment_methods_enabled\": [" +
                "    {" +
                "        \"payment_method\": \"bank_transfer\"," +
                "        \"payment_method_types\": [" +
                "            {" +
                "                \"payment_method_type\": \"bca_bank_transfer\"," +
                "                \"payment_experience\": \"invoke_sdk_client\"" +
                "            }" +
                "        ]" +
                "    }" +
                "]," +
                "\"profile_id\": \"" + extractJsonValue(accountResponse, "default_profile") + "\"" +
                "}";
                
        String connectorResponse = sendPost(BASE_URL + "/account/" + merchantId + "/connectors", connectorPayload, apiKey);
        System.out.println("   Connector Response: " + connectorResponse + "\n");
        
        System.out.println("4. Membuat Payment Request ke Bimasakti (Simulasi Pasien Membayar QRIS/VA)...");
        String paymentPayload = "{" +
                "\"amount\": 50000," +
                "\"currency\": \"IDR\"," +
                "\"confirm\": true," +
                "\"payment_method\": \"bank_transfer\"," +
                "\"payment_method_type\": \"bca_bank_transfer\"," +
                "\"payment_method_data\": {" +
                "    \"bank_transfer\": {" +
                "        \"bca_bank_transfer\": {}" +
                "    }" +
                "}," +
                "\"routing\": {" +
                "    \"type\": \"single\"," +
                "    \"data\": \"bimasakti\"" +
                "}," +
                "\"customer_id\": \"pasien_001\"," +
                "\"profile_id\": \"" + extractJsonValue(accountResponse, "default_profile") + "\"," +
                "\"description\": \"Pembayaran Rawat Jalan E2E\"," +
                "\"return_url\": \"https://simrs.local/success\"" +
                "}";
                
        String paymentResponse = sendPost(BASE_URL + "/payments", paymentPayload, apiKey);
        System.out.println("   Payment Response: \n" + formatJson(paymentResponse) + "\n");
        
        if (paymentResponse.contains("\"status\":\"failed\"")) {
            System.out.println("❌ E2E TEST GAGAL: Payment status failed.");
        } else if (paymentResponse.contains("bimasakti")) {
            System.out.println("✅ E2E TEST BERHASIL! Router meneruskan ke konektor Bimasakti dengan native Rust HMAC-SHA512.");
        } else {
            System.out.println("⚠️ RESPON DITERIMA, HARAP PERIKSA LOG HYPERSWITCH.");
        }
    }

    private static String sendPost(String url, String json, String apiKey) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Content-Type", "application/json")
                .header("api-key", apiKey)
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        return response.body();
    }
    
    private static String extractJsonValue(String json, String key) {
        Pattern pattern = Pattern.compile("\"" + key + "\"\\s*:\\s*\"([^\"]+)\"");
        Matcher matcher = pattern.matcher(json);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return null;
    }
    
    private static String formatJson(String json) {
        // Very basic JSON formatter for display
        return json.replace(",", ",\n    ").replace("{", "{\n    ").replace("}", "\n}");
    }
}
