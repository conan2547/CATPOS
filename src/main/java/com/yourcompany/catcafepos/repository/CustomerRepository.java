package com.yourcompany.catcafepos.repository;

import com.yourcompany.catcafepos.model.Customer;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * จัดการข้อมูลลูกค้าในฐานข้อมูล
 */
public interface CustomerRepository extends JpaRepository<Customer, Long> {}
