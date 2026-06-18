package bridging;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import fungsi.koneksiDB;
import java.security.InvalidAlgorithmParameterException;
import java.security.InvalidKeyException;
import java.security.KeyManagementException;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import javax.crypto.BadPaddingException;
import javax.crypto.IllegalBlockSizeException;
import javax.crypto.NoSuchPaddingException;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import org.apache.http.conn.scheme.Scheme;
import org.apache.http.conn.ssl.SSLSocketFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

public class ApiSatuSehat {        
    private String key,clientid,urlauth,token;
    private long millis;
    private SSLContext sslContext;
    private SSLSocketFactory sslFactory;
    private Scheme scheme;
    private HttpComponentsClientHttpRequestFactory factory;
    private ApiBPJSAesKeySpec mykey;
    private HttpHeaders header ;
    private JsonNode root;
    private HttpEntity requestEntity;
    private ObjectMapper mapper = new ObjectMapper();
    
    public ApiSatuSehat(){
        try {
            key = koneksiDB.SECRETKEYSATUSEHAT();
            clientid = koneksiDB.CLIENTIDSATUSEHAT();
            urlauth = koneksiDB.URLAUTHSATUSEHAT();
        } catch (Exception ex) {
            System.out.println("Notifikasi : "+ex);
        }
    }

    public String TokenSatuSehat(){
        try {    
            header = new HttpHeaders();
            header.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            requestEntity = new HttpEntity("client_id="+clientid+"&client_secret="+key,header);
            root = mapper.readTree(getRest().exchange(urlauth+"/accesstoken?grant_type=client_credentials", HttpMethod.POST, requestEntity, String.class).getBody());
            token=root.path("access_token").asText();
        } catch (Exception ex) {
            System.out.println("Notifikasi : "+ex);
        }
        return token;
    }
        
    public long GetUTCdatetimeAsString(){    
        millis = System.currentTimeMillis();   
        return millis/1000;
    }
    
    public String Decrypt(String data,String utc)throws NoSuchPaddingException, NoSuchAlgorithmException, InvalidAlgorithmParameterException, InvalidKeyException, BadPaddingException, IllegalBlockSizeException {
        System.out.println(data);
        mykey = ApiBPJSEnc.generateKey(clientid+key+utc);
        data=ApiBPJSEnc.decrypt(data, mykey.getKey(), mykey.getIv());
        data=ApiBPJSLZString.decompressFromEncodedURIComponent(data);
        System.out.println(data);
        return data;
    }
    
    public RestTemplate getRest() throws NoSuchAlgorithmException, KeyManagementException {
        sslContext = SSLContext.getInstance("TLSv1.2");
        TrustManager[] trustManagers= {
            new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() {return null;}
                public void checkServerTrusted(X509Certificate[] arg0, String arg1)throws CertificateException {}
                public void checkClientTrusted(X509Certificate[] arg0, String arg1)throws CertificateException {}
            }
        };
        sslContext.init(null,trustManagers , new SecureRandom());
        sslFactory=new SSLSocketFactory(sslContext,SSLSocketFactory.ALLOW_ALL_HOSTNAME_VERIFIER);
        scheme=new Scheme("https",443,sslFactory);
        factory=new HttpComponentsClientHttpRequestFactory();
        factory.getHttpClient().getConnectionManager().getSchemeRegistry().register(scheme);
        
        RestTemplate restTemplate = new RestTemplate(new org.springframework.http.client.BufferingClientHttpRequestFactory(factory));
        
        restTemplate.setInterceptors(java.util.Collections.singletonList(new org.springframework.http.client.ClientHttpRequestInterceptor() {
            @Override
            public org.springframework.http.client.ClientHttpResponse intercept(org.springframework.http.HttpRequest request, byte[] body, org.springframework.http.client.ClientHttpRequestExecution execution) throws java.io.IOException {
                org.springframework.http.client.ClientHttpResponse response = execution.execute(request, body);
                
                try {
                    String reqBody = new String(body, java.nio.charset.StandardCharsets.UTF_8);
                    String resBody = org.springframework.util.StreamUtils.copyToString(response.getBody(), java.nio.charset.StandardCharsets.UTF_8);
                    String url = request.getURI().toString();
                    String method = request.getMethod().name();
                    int statusCode = response.getRawStatusCode();
                    String timeStamp = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS").format(new java.util.Date());
                    
                    // Rekam tersentralisasi ke database utama SIMRS (100% global client coverage)
                    try (java.sql.Connection con = fungsi.koneksiDB.condb()) {
                        if (con != null) {
                            // Self-bootstrap tabel log jika belum terbentuk
                            try (java.sql.Statement stmt = con.createStatement()) {
                                stmt.execute("CREATE TABLE IF NOT EXISTS satusehat_payload_logs (" +
                                             "id INT AUTO_INCREMENT PRIMARY KEY, " +
                                             "timestamp VARCHAR(30), " +
                                             "url VARCHAR(255), " +
                                             "method VARCHAR(10), " +
                                             "status_code INT, " +
                                             "request_body LONGTEXT, " +
                                             "response_body LONGTEXT" +
                                             ")");
                            }
                            
                            // Insert log request & response
                            String query = "INSERT INTO satusehat_payload_logs (timestamp, url, method, status_code, request_body, response_body) VALUES (?, ?, ?, ?, ?, ?)";
                            try (java.sql.PreparedStatement ps = con.prepareStatement(query)) {
                                ps.setString(1, timeStamp);
                                ps.setString(2, url);
                                ps.setString(3, method);
                                ps.setInt(4, statusCode);
                                ps.setString(5, reqBody);
                                ps.setString(6, resBody);
                                ps.executeUpdate();
                            }
                        }
                    } catch (Exception dbEx) {
                        System.out.println("Gagal mencatat log SatuSehat ke database terpusat: " + dbEx.getMessage());
                    }
                    
                    // Fallback log lokal untuk kemudahan debugging lokal
                    String logDir = "/Users/user/OPREK2/simrs-khanza/satusehat_logs";
                    java.nio.file.Files.createDirectories(java.nio.file.Paths.get(logDir));
                    String logFileStamp = new java.text.SimpleDateFormat("yyyyMMdd_HHmmssSSS").format(new java.util.Date());
                    String logData = "=== REQUEST ===\nTIME: " + timeStamp + "\nURL: " + url + "\nMETHOD: " + method + "\nBODY:\n" + reqBody + "\n\n" +
                                     "=== RESPONSE ===\nSTATUS: " + statusCode + "\nBODY:\n" + resBody + "\n\n--------------------------------------------------\n";
                    java.nio.file.Files.write(java.nio.file.Paths.get(logDir + "/payload_" + logFileStamp + ".log"), logData.getBytes(), java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
                } catch (Exception e) {
                    System.out.println("Gagal memproses interseptor log SatuSehat: " + e.getMessage());
                }
                
                return response;
            }
        }));
        
        return restTemplate;
    }

}
