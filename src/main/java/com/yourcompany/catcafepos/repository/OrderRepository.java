package com.yourcompany.catcafepos.repository;

import com.yourcompany.catcafepos.model.Order;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * ใช้เข้าถึงและค้นหาออเดอร์ในฐานข้อมูล
 */
public interface OrderRepository extends JpaRepository<Order, Long> {

    /**
     * ค้นหาออเดอร์ภายในช่วงเวลาที่กำหนด
     */
    List<Order> findByOrderDateBetween(LocalDateTime start, LocalDateTime end);
}
