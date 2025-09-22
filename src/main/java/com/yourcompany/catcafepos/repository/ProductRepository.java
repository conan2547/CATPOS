package com.yourcompany.catcafepos.repository;

import com.yourcompany.catcafepos.model.Product;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * จัดการข้อมูลสินค้าบนฐานข้อมูล
 */
public interface ProductRepository extends JpaRepository<Product, Long> {

    /**
     * ค้นหาสินค้าจากรหัสสินค้า
     */
    Product findByCode(String code);
}
