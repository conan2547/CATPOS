package com.yourcompany.catcafepos.controller;

import com.yourcompany.catcafepos.model.Order;
import com.yourcompany.catcafepos.service.OrderService;
import java.time.LocalDate;
import java.util.Map;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * ให้เฉพาะรายงานช่วงวันที่สำหรับหน้า Dashboard (กราฟเรนเดอร์ฝั่งลูกค้า)
 */
@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final OrderService service;

    public OrderController(OrderService service) {
        this.service = service;
    }

    @GetMapping("/report")
    public Map<String, Object> report(
            @RequestParam("start") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam("end") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end) {
        var list = service.between(start, end);
        double total = list.stream().mapToDouble(Order::getTotalAmount).sum();
        return Map.of("orders", list, "totalSales", total);
    }
}
