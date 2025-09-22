package com.yourcompany.catcafepos.service;

import com.yourcompany.catcafepos.dto.LoginRequestDTO;
import com.yourcompany.catcafepos.dto.LoginResponseDTO;
import com.yourcompany.catcafepos.model.User;
import com.yourcompany.catcafepos.repository.UserRepository;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.UUID;
import java.time.LocalDateTime;

/**
 * จัดการการเข้าสู่ระบบและการจัดการเซสชันของผู้ใช้
 */
@Service
public class AuthService {
    private final UserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder;
    private final Map<String, SessionInfo> activeSessions = new ConcurrentHashMap<>(); // token -> session info

    /**
     * สร้างบริการยืนยันตัวตนพร้อมกำหนดผู้ใช้เริ่มต้น
     */
    public AuthService(UserRepository userRepository) {
        this.userRepository = userRepository;
        this.passwordEncoder = new BCryptPasswordEncoder();
        createDefaultUsers();
    }

    /**
     * เก็บข้อมูลเซสชันของผู้ใช้แต่ละคน
     */
    private static class SessionInfo {
        final Long userId;
        final LocalDateTime createdAt;
        final LocalDateTime lastAccessed;

        /**
         * สร้างเซสชันใหม่พร้อมบันทึกเวลาปัจจุบัน
         */
        public SessionInfo(Long userId) {
            this.userId = userId;
            this.createdAt = LocalDateTime.now();
            this.lastAccessed = LocalDateTime.now();
        }

        /**
         * คืนสำเนาเซสชันพร้อมอัปเดตเวลาที่เข้าถึงล่าสุด
         */
        public SessionInfo updateLastAccessed() {
            return new SessionInfo(userId, createdAt, LocalDateTime.now());
        }

        /**
         * สร้างเซสชันจากค่าที่ระบุไว้ทั้งหมด
         */
        public SessionInfo(Long userId, LocalDateTime createdAt, LocalDateTime lastAccessed) {
            this.userId = userId;
            this.createdAt = createdAt;
            this.lastAccessed = lastAccessed;
        }

        /**
         * ตรวจสอบว่าเซสชันหมดอายุหรือไม่ตามเวลาที่กำหนด
         */
        public boolean isExpired() {
            return lastAccessed.isBefore(LocalDateTime.now().minusHours(8)); // 8 hour session timeout
        }
    }

    /**
     * ตรวจสอบข้อมูลเข้าสู่ระบบและสร้างเซสชันใหม่เมื่อสำเร็จ
     */
    public LoginResponseDTO login(LoginRequestDTO request) {
        try {
            User user = userRepository.findByUsernameAndActive(request.getUsername(), true)
                    .orElse(null);

            // Check user exists and password matches (with BCrypt hashing)
            if (user != null && passwordEncoder.matches(request.getPassword(), user.getPassword())) {
                // Clean up expired sessions first
                cleanupExpiredSessions();

                String sessionToken = UUID.randomUUID().toString();
                activeSessions.put(sessionToken, new SessionInfo(user.getId()));

                LoginResponseDTO.UserDTO userDTO = new LoginResponseDTO.UserDTO(
                        user.getId(), user.getUsername(), user.getFullName(), user.getRole());

                LoginResponseDTO response = new LoginResponseDTO(true, "เข้าสู่ระบบสำเร็จ");
                response.setSessionToken(sessionToken);
                response.setUser(userDTO);
                return response;
            } else {
                return new LoginResponseDTO(false, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
            }
        } catch (Exception e) {
            return new LoginResponseDTO(false, "เกิดข้อผิดพลาด: " + e.getMessage());
        }
    }

    /**
     * ตรวจสอบว่าโทเคนเซสชันยังคงถูกต้องอยู่หรือไม่
     */
    public boolean isValidSession(String sessionToken) {
        if (sessionToken == null || !activeSessions.containsKey(sessionToken)) {
            return false;
        }

        SessionInfo sessionInfo = activeSessions.get(sessionToken);
        if (sessionInfo.isExpired()) {
            activeSessions.remove(sessionToken);
            return false;
        }

        // Update last accessed time
        activeSessions.put(sessionToken, sessionInfo.updateLastAccessed());
        return true;
    }

    /**
     * ยกเลิกเซสชันตามโทเคนที่ระบุ
     */
    public void logout(String sessionToken) {
        if (sessionToken != null) {
            activeSessions.remove(sessionToken);
        }
    }

    /**
     * ลบเซสชันที่หมดอายุออกจากรายการ
     */
    private void cleanupExpiredSessions() {
        activeSessions.entrySet().removeIf(entry -> entry.getValue().isExpired());
    }

    /**
     * สร้างบัญชีผู้ใช้เริ่มต้นเมื่อระบบยังไม่มีข้อมูลพนักงาน
     */
    private void createDefaultUsers() {
        if (userRepository.count() == 0) {
            // Create admin user
            User admin = new User("admin", passwordEncoder.encode("admin123"), "ผู้ดูแลระบบ", "ADMIN");
            admin.setEmail("admin@catcafe.com");
            admin.setDepartment("จัดการ");
            admin.setEmployeeId("EMP001");
            userRepository.save(admin);

            // Create cashier user
            User cashier = new User("cashier", passwordEncoder.encode("cashier123"), "พนักงานขาย", "CASHIER");
            cashier.setEmail("cashier@catcafe.com");
            cashier.setDepartment("การขาย");
            cashier.setEmployeeId("EMP002");
            userRepository.save(cashier);

            // Create manager user
            User manager = new User("manager", passwordEncoder.encode("manager123"), "ผู้จัดการ", "MANAGER");
            manager.setEmail("manager@catcafe.com");
            manager.setDepartment("จัดการ");
            manager.setEmployeeId("EMP003");
            userRepository.save(manager);
        }
    }

}
